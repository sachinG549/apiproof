import { readFileSync, readdirSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { GALLERY_SOURCES } from "@/lib/gallery/sources";
import { parseSpec } from "@/lib/spec/parse";
import { UserError } from "@/lib/errors";

describe("parseSpec", () => {
  it("parses JSON and YAML OpenAPI 3", () => {
    const json = parseSpec(JSON.stringify({
      openapi: "3.0.3",
      info: { title: "JSON shop", version: "1" },
      paths: { "/ping": { get: { operationId: "ping", responses: { "200": { description: "ok" } } } } },
    }));
    expect(json.title).toBe("JSON shop");
    expect(json.operations).toHaveLength(1);

    const yaml = parseSpec(`
openapi: 3.0.3
info: { title: YAML shop, version: "2" }
paths:
  /ping:
    get:
      operationId: ping
      responses:
        "200": { description: ok }
`);
    expect(yaml.title).toBe("YAML shop");
    expect(yaml.operations[0].operationId).toBe("ping");
  });

  it("converts Swagger 2 and keeps body parameters", () => {
    const spec = parseSpec(`
swagger: "2.0"
info: { title: Legacy, version: "1" }
host: api.example.com
basePath: /v1
schemes: [https]
definitions:
  Pet:
    type: object
    required: [name]
    properties:
      name: { type: string }
paths:
  /pets:
    post:
      operationId: addPet
      summary: Add a pet
      parameters:
        - in: body
          name: body
          required: true
          schema: { $ref: "#/definitions/Pet" }
      responses:
        "201":
          description: created
          schema: { $ref: "#/definitions/Pet" }
`);
    expect(spec.convertedFrom).toBe("swagger2");
    expect(spec.openapi.startsWith("3.")).toBe(true);
    expect(spec.operations[0].requestBody?.schema?.required).toContain("name");
    expect(spec.warnings[0]).toMatch(/Swagger 2\.0/);
  });

  it("explains a missing version and empty documents", () => {
    expect(() => parseSpec("{ \"info\": { \"title\": \"x\" } }")).toThrow(UserError);
    expect(() => parseSpec("")).toThrow(/empty/i);
    expect(() => parseSpec("{")).toThrow(/JSON/i);
    expect(() => parseSpec("openapi: 3.0.3\ninfo: { title: x, version: '1' }\npaths: {}")).toThrow(/No paths/);
  });

  it("parses every vendored gallery snapshot", () => {
    const dir = path.join(process.cwd(), "src/data/gallery");
    const files = readdirSync(dir).filter((file) => file.endsWith(".json"));
    expect(files.length).toBe(GALLERY_SOURCES.length);
    for (const source of GALLERY_SOURCES) {
      const spec = parseSpec(readFileSync(path.join(dir, `${source.slug}.json`), "utf8"));
      expect(spec.operations.length, source.slug).toBeGreaterThan(0);
      expect(source.tasks.length).toBeGreaterThanOrEqual(3);
      expect(source.tasks.length).toBeLessThanOrEqual(10);
    }
  });
});
