import { describe, expect, it } from "vitest";
import { MockApi } from "@/lib/mock/server";
import { parseSpec } from "@/lib/spec/parse";

const spec = parseSpec(`
openapi: 3.0.3
info: { title: Shop, version: "1" }
components:
  securitySchemes:
    api_key:
      type: apiKey
      name: api_key
      in: header
paths:
  /pets:
    post:
      operationId: addPet
      summary: Add a pet
      security: [{ api_key: [] }]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [name]
              properties:
                id: { type: integer }
                name: { type: string }
                status: { type: string }
      responses:
        "201":
          description: created
          content:
            application/json:
              schema:
                type: object
                required: [id, name]
                properties:
                  id: { type: integer }
                  name: { type: string }
                  status: { type: string }
    get:
      operationId: listPets
      summary: List pets
      parameters:
        - name: status
          in: query
          schema: { type: string }
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
                  properties:
                    id: { type: integer }
                    name: { type: string }
                    status: { type: string }
  /pets/{petId}:
    get:
      operationId: getPet
      summary: Fetch a pet by id
      security: [{ api_key: [] }]
      parameters:
        - name: petId
          in: path
          required: true
          schema: { type: integer }
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                type: object
                required: [id, name]
                properties:
                  id: { type: integer }
                  name: { type: string }
  /repos/{owner}/{repo}/issues:
    post:
      operationId: createIssue
      summary: Create an issue
      parameters:
        - { name: owner, in: path, required: true, schema: { type: string } }
        - { name: repo, in: path, required: true, schema: { type: string } }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [title]
              properties:
                title: { type: string }
                number: { type: integer }
      responses:
        "201":
          description: created
          content:
            application/json:
              schema:
                type: object
                properties:
                  number: { type: integer }
                  title: { type: string }
  /repos/{owner}/{repo}/issues/{issue_number}:
    get:
      operationId: getIssue
      summary: Get an issue
      parameters:
        - { name: owner, in: path, required: true, schema: { type: string } }
        - { name: repo, in: path, required: true, schema: { type: string } }
        - { name: issue_number, in: path, required: true, schema: { type: integer } }
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                type: object
                properties:
                  number: { type: integer }
                  title: { type: string }
`);

function op(id: string) {
  const operation = spec.operations.find((item) => item.operationId === id);
  if (!operation) throw new Error(id);
  return operation;
}

describe("mock server", () => {
  it("creates a pet, lists it, and fetches it by the same id", () => {
    const mock = new MockApi(spec);
    const created = mock.call(op("addPet"), {
      authToken: "apiproof-demo",
      body: { name: "DemoDog", status: "available" },
    });
    expect(created.status).toBe(201);
    const body = created.response as { id: number; name: string };
    expect(body.name).toBe("DemoDog");
    expect(typeof body.id).toBe("number");

    const listed = mock.call(op("listPets"), { status: "available" });
    expect(listed.status).toBe(200);
    expect(listed.response).toEqual([expect.objectContaining({ name: "DemoDog", status: "available" })]);

    const fetched = mock.call(op("getPet"), { petId: body.id, authToken: "apiproof-demo" });
    expect(fetched.status).toBe(200);
    expect(fetched.response).toEqual(expect.objectContaining({ id: body.id, name: "DemoDog" }));
  });

  it("rejects missing auth and invalid bodies", () => {
    const mock = new MockApi(spec);
    const unauth = mock.call(op("addPet"), { body: { name: "DemoDog" } });
    expect(unauth.status).toBe(401);
    expect(unauth.errorCode).toBe("auth_required");

    const invalid = mock.call(op("addPet"), { authToken: "x", body: { status: "available" } });
    expect(invalid.status).toBe(400);
    expect(invalid.errorCode).toBe("schema_mismatch");

    const missing = mock.call(op("getPet"), { authToken: "x" });
    expect(missing.status).toBe(400);
    expect(missing.missingParameter).toBe("petId");
  });

  it("keeps issue ids consistent across owner and repo", () => {
    const mock = new MockApi(spec);
    const created = mock.call(op("createIssue"), {
      owner: "octocat",
      repo: "hello-world",
      body: { title: "APIProof check" },
    });
    expect(created.status).toBe(201);
    const number = (created.response as { number: number }).number;
    const fetched = mock.call(op("getIssue"), {
      owner: "octocat",
      repo: "hello-world",
      issue_number: number,
    });
    expect(fetched.status).toBe(200);
    expect(fetched.response).toEqual(expect.objectContaining({ number, title: "APIProof check" }));

    const otherRepo = mock.call(op("getIssue"), { owner: "octocat", repo: "other", issue_number: number });
    expect(otherRepo.status).toBe(404);
  });
});
