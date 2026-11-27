export type JsonSchema = {
  type?: string | string[];
  format?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  example?: unknown;
  default?: unknown;
  additionalProperties?: boolean | JsonSchema;
  allOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  nullable?: boolean;
  minimum?: number;
  maximum?: number;
};

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

export type Parameter = {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  description?: string;
  schema?: JsonSchema;
};

export type RequestBody = {
  required: boolean;
  description?: string;
  contentType: string;
  schema?: JsonSchema;
};

export type ResponseDef = {
  description?: string;
  schema?: JsonSchema;
  example?: unknown;
};

export type SecurityScheme = {
  key: string;
  type: string;
  in?: string;
  paramName?: string;
};

export type Operation = {
  operationId: string;
  method: HttpMethod;
  path: string;
  pathKey: string;
  summary: string;
  description: string;
  tags: string[];
  parameters: Parameter[];
  requestBody?: RequestBody;
  responses: Record<string, ResponseDef>;
  security: SecurityScheme[][];
  collection: string;
  itemParam?: string;
};

export type ParsedSpec = {
  title: string;
  version: string;
  openapi: string;
  description: string;
  document: Record<string, unknown>;
  operations: Operation[];
  warnings: string[];
  convertedFrom?: "swagger2";
  trimmedFrom?: number;
  trimNote?: string;
};

export const FAILURE_MODES = [
  "wrong_operation",
  "missing_parameter",
  "ambiguous_parameter",
  "unclear_id_linkage",
  "auth_confusion",
  "schema_mismatch",
  "gave_up",
  "hallucinated_endpoint",
  "quota_exhausted",
  "judge_unverified",
] as const;

export type FailureMode = (typeof FAILURE_MODES)[number];

export type Suggestion = {
  failureMode: FailureMode;
  method: string;
  path: string;
  title: string;
  detail: string;
};

export type StepRecord = {
  index: number;
  kind: "reasoning" | "tool";
  reasoning?: string;
  toolName?: string;
  method?: string;
  path?: string;
  args?: unknown;
  status?: number;
  response?: unknown;
  error?: string;
};

export type CallLogEntry = {
  method: string;
  pathTemplate: string;
  path: string;
  operationId: string;
  args: Record<string, unknown>;
  status: number;
  response: unknown;
  errorCode?: string;
  missingParameter?: string;
  auth: "ok" | "missing" | "not_required";
};

export type TaskRunResult = {
  status: "done" | "error";
  passed: boolean | null;
  failureMode: FailureMode | null;
  explanation: string;
  suggestion: Suggestion | null;
  steps: StepRecord[];
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  checkSource: "deterministic" | "judge" | "unscored";
  usedFallback: boolean;
  modelLabel: string;
  error?: string;
};

export type PublicSuggestion = Suggestion;

export type PublicResult = {
  id: string;
  modelId: string;
  modelLabel: string;
  taskIndex: number;
  taskText: string;
  status: string;
  passed: boolean | null;
  failureMode: string | null;
  explanation: string | null;
  suggestion: PublicSuggestion | null;
  steps: StepRecord[];
  latencyMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  checkSource: string | null;
  usedFallback: boolean;
  error: string | null;
};

export type ModelSummary = {
  modelId: string;
  modelLabel: string;
  passed: number;
  failed: number;
  unscored: number;
  total: number;
  promptTokens: number;
  completionTokens: number;
  avgLatencyMs: number | null;
};

export type PublicReport = {
  run: {
    id: string;
    createdAt: string;
    specTitle: string;
    specVersion: string;
    openapi: string;
    operationCount: number;
    trimmed: boolean;
    trimNote: string | null;
    tasks: string[];
    status: string;
    notice: string | null;
    providerMode: "live" | "stub" | "partial";
    cached: boolean;
  };
  results: PublicResult[];
  summary: { models: ModelSummary[] };
};

export type ProviderInfo = {
  id: string;
  label: string;
  kind: "groq" | "gemini" | "stub";
};

export type StorageMode = "memory" | "postgres";
