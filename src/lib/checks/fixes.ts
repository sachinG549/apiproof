import type { FailureMode, Operation, Suggestion } from "@/lib/types";

export function suggestFix(input: {
  failureMode: FailureMode;
  operation?: Operation;
  related?: Operation;
  detail?: string;
}): Suggestion | null {
  const operation = input.operation;
  if (!operation) return null;
  const method = operation.method.toUpperCase();
  const path = operation.path;
  const related = input.related ? `${input.related.method.toUpperCase()} ${input.related.path}` : null;

  switch (input.failureMode) {
    case "wrong_operation":
      return {
        failureMode: input.failureMode,
        method,
        path,
        title: `Make ${method} ${path} obvious for this task`,
        detail: related
          ? `The task points at ${method} ${path}, but the agent called something else. "${operation.summary}" is easy to confuse with ${related}. Say what this operation does that the neighbor does not, and add an example.`
          : `The task points at ${method} ${path} ("${operation.summary}"), but the agent did not call it. Lead the summary with the verb and the noun a person would use, and add a one-line example.`,
      };
    case "missing_parameter":
      return {
        failureMode: input.failureMode,
        method,
        path,
        title: `Say where ${input.detail || "the required parameter"} comes from`,
        detail: `${method} ${path} failed because a required value was missing or did not match the task. Name the parameter, say which previous response field supplies it, and show one example value.`,
      };
    case "ambiguous_parameter":
      return {
        failureMode: input.failureMode,
        method,
        path,
        title: "Disambiguate similarly named parameters",
        detail: `${method} ${path} has parameters that look alike${input.detail ? ` (${input.detail})` : ""}. Give each a description that says exactly which identifier it is, and use one name consistently in the path, the response, and the example.`,
      };
    case "unclear_id_linkage":
      return {
        failureMode: input.failureMode,
        method,
        path,
        title: "Show which response field is the id for the next call",
        detail: related
          ? `${related} returns an identifier that ${method} ${path} needs, but the agent did not carry it over. On the create response, describe the field as the value for \`${operation.itemParam || "id"}\` and add a two-call example.`
          : `${method} ${path} was called with an id that never appeared in an earlier response. Document which field to copy, and show the create response next to the follow-up call.`,
      };
    case "auth_confusion":
      return {
        failureMode: input.failureMode,
        method,
        path,
        title: "State the credential on the operation, not only globally",
        detail: `${method} ${path} requires auth and the agent missed it. Repeat the header or scheme name in the operation description. Say that a non-empty credential is required and give the header name.`,
      };
    case "schema_mismatch":
      return {
        failureMode: input.failureMode,
        method,
        path,
        title: "Make the request schema match a real example",
        detail: `${method} ${path} rejected the body. ${input.detail || "Required fields were missing or the wrong type."} Put a complete example next to the schema and mark required fields in the description, not only in \`required\`.`,
      };
    case "gave_up":
      return {
        failureMode: input.failureMode,
        method,
        path,
        title: "Describe the multi-step flow in the spec",
        detail: `The agent stopped before finishing. ${method} ${path} is part of the task${related ? ` after ${related}` : ""}, but nothing in the spec ties those calls together. Add a short workflow description that names both operations and the id that connects them.`,
      };
    case "hallucinated_endpoint":
      return {
        failureMode: input.failureMode,
        method,
        path,
        title: "Name the real operation in the words the task uses",
        detail: `The agent invented a call instead of using ${method} ${path}. Use the task's words in the summary and operationId so the real operation is the obvious match.`,
      };
    default:
      return null;
  }
}
