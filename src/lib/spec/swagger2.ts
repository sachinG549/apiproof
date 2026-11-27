import { isRecord } from "@/lib/util";

export function isSwagger2(document: unknown): boolean {
  return isRecord(document) && document.swagger === "2.0";
}

export function swagger2ToOpenapi(document: Record<string, unknown>): Record<string, unknown> {
  const schemes = Array.isArray(document.schemes) && document.schemes.length ? document.schemes : ["https"];
  const host = typeof document.host === "string" ? document.host : "example.invalid";
  const basePath = typeof document.basePath === "string" ? document.basePath : "";
  const servers = schemes
    .filter((scheme): scheme is string => typeof scheme === "string")
    .map((scheme) => ({ url: `${scheme}://${host}${basePath}` }));

  const securitySchemes: Record<string, unknown> = {};
  if (isRecord(document.securityDefinitions)) {
    for (const [name, scheme] of Object.entries(document.securityDefinitions)) {
      if (isRecord(scheme)) securitySchemes[name] = convertSecurity(scheme);
    }
  }

  const paths: Record<string, unknown> = {};
  if (isRecord(document.paths)) {
    for (const [path, item] of Object.entries(document.paths)) {
      if (!isRecord(item)) continue;
      const operations: Record<string, unknown> = {};
      const pathParameters = Array.isArray(item.parameters) ? item.parameters : [];
      for (const method of ["get", "post", "put", "patch", "delete"]) {
        const operation = item[method];
        if (!isRecord(operation)) continue;
        operations[method] = convertOperation(operation, pathParameters);
      }
      if (pathParameters.length && !operations.parameters) {
        // Path-level parameters are copied onto each operation above.
      }
      paths[path] = operations;
    }
  }

  return rewriteRefs({
    openapi: "3.0.3",
    info: isRecord(document.info) ? document.info : { title: "Converted API", version: "0" },
    servers,
    paths,
    components: {
      schemas: isRecord(document.definitions) ? document.definitions : {},
      securitySchemes,
    },
    security: document.security,
  });
}

function convertSecurity(scheme: Record<string, unknown>): Record<string, unknown> {
  if (scheme.type === "basic") return { type: "http", scheme: "basic" };
  if (scheme.type === "apiKey") return { type: "apiKey", name: scheme.name, in: scheme.in };
  if (scheme.type === "oauth2") {
    const flow = typeof scheme.flow === "string" ? scheme.flow : "implicit";
    return {
      type: "oauth2",
      flows: {
        [flow === "accessCode" ? "authorizationCode" : flow]: {
          authorizationUrl: scheme.authorizationUrl || "https://example.invalid/oauth",
          tokenUrl: scheme.tokenUrl,
          scopes: isRecord(scheme.scopes) ? scheme.scopes : {},
        },
      },
    };
  }
  return { type: "http", scheme: "bearer" };
}

function convertOperation(operation: Record<string, unknown>, pathParameters: unknown[]): Record<string, unknown> {
  const parameters: Record<string, unknown>[] = [];
  let jsonSchema: unknown;
  let jsonRequired = false;
  const formProperties: Record<string, unknown> = {};
  const formRequired: string[] = [];

  const rawParams = [...pathParameters, ...(Array.isArray(operation.parameters) ? operation.parameters : [])];
  for (const parameter of rawParams) {
    if (!isRecord(parameter)) continue;
    if (parameter.in === "body") {
      jsonSchema = parameter.schema;
      jsonRequired = Boolean(parameter.required);
      continue;
    }
    if (parameter.in === "formData") {
      const name = String(parameter.name);
      formProperties[name] = parameter.schema || {
        type: parameter.type || "string",
        enum: parameter.enum,
        items: parameter.items,
      };
      if (parameter.required) formRequired.push(name);
      continue;
    }
    parameters.push({
      name: parameter.name,
      in: parameter.in,
      required: Boolean(parameter.required) || parameter.in === "path",
      description: parameter.description,
      schema: parameter.schema || {
        type: parameter.type || "string",
        format: parameter.format,
        enum: parameter.enum,
        items: parameter.items,
      },
    });
  }

  let requestBody: Record<string, unknown> | undefined;
  if (jsonSchema) {
    requestBody = {
      required: jsonRequired,
      content: { "application/json": { schema: jsonSchema } },
    };
  } else if (Object.keys(formProperties).length) {
    requestBody = {
      required: formRequired.length > 0,
      content: {
        "application/json": {
          schema: { type: "object", properties: formProperties, required: formRequired },
        },
      },
    };
  }

  const responses: Record<string, unknown> = {};
  if (isRecord(operation.responses)) {
    for (const [code, response] of Object.entries(operation.responses)) {
      if (!isRecord(response)) {
        responses[code] = { description: String(response ?? "") };
        continue;
      }
      responses[code] = {
        description: response.description || "",
        content: response.schema ? { "application/json": { schema: response.schema } } : undefined,
      };
    }
  }

  return {
    operationId: operation.operationId,
    summary: operation.summary,
    description: operation.description,
    tags: operation.tags,
    parameters,
    requestBody,
    responses,
    security: operation.security,
  };
}

function rewriteRefs(value: unknown): any {
  if (Array.isArray(value)) return value.map((item) => rewriteRefs(item));
  if (!isRecord(value)) return value;
  const copy: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "$ref" && typeof item === "string") {
      copy[key] = item.replace("#/definitions/", "#/components/schemas/");
    } else {
      copy[key] = rewriteRefs(item);
    }
  }
  return copy;
}
