import type {
  AssistantMessage,
  Middleware,
  MiddlewareContext,
  Message,
  Tool,
  ToolCall,
  ToolCallArguments,
  ToolDefinition,
  ToolParameter,
  ToolMessage,
} from "../types.ts";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeToolCallArguments(value: unknown): ToolCallArguments {
  if (isRecord(value)) {
    return value;
  }

  if (typeof value === "string") {
    return value;
  }

  return "";
}

export function mergeToolCallArguments(
  current: ToolCallArguments,
  incoming: ToolCallArguments,
): ToolCallArguments {
  if (isRecord(current) && isRecord(incoming)) {
    return { ...current, ...incoming };
  }

  if (typeof current === "string" && typeof incoming === "string") {
    return current + incoming;
  }

  if (typeof current === "string" && isRecord(incoming)) {
    if (!current) {
      return incoming;
    }

    try {
      const parsedCurrent = JSON.parse(current);
      if (isRecord(parsedCurrent)) {
        return { ...parsedCurrent, ...incoming };
      }
    } catch {
      return current + JSON.stringify(incoming);
    }
  }

  if (isRecord(current) && typeof incoming === "string") {
    if (!incoming) {
      return current;
    }

    try {
      const parsedIncoming = JSON.parse(incoming);
      if (isRecord(parsedIncoming)) {
        return { ...current, ...parsedIncoming };
      }
    } catch {
      return JSON.stringify(current) + incoming;
    }
  }

  return incoming;
}

export function normalizeToolArguments(
  args: ToolCallArguments,
): Record<string, unknown> | undefined {
  if (isRecord(args)) {
    return args;
  }

  if (!args) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(args);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function stringifyToolResult(result: unknown): string {
  return typeof result === "string" ? result : JSON.stringify(result);
}

export function createTool(
  name: string,
  description: string,
  parameters: Record<string, ToolParameter>,
  execute: (args: Record<string, unknown>) => Promise<string> | string,
): Tool {
  const required = Object.keys(parameters);

  return {
    definition: {
      type: "function",
      function: {
        name,
        description,
        parameters: {
          type: "object",
          properties: parameters,
          required,
        },
      },
    },
    execute,
  };
}

export type {
  ToolParameter,
  ToolDefinition,
  ToolCall,
  AssistantMessage,
  ToolMessage,
  Message,
  Tool,
  Middleware,
  MiddlewareContext,
};
