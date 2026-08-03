export interface ToolParameter {
  type: string;
  description?: string;
  enum?: string[];
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, ToolParameter>;
      required: string[];
    };
  };
}

export interface ToolCall {
  function: {
    name: string;
    arguments: ToolCallArguments;
  };
}

export type ToolCallArguments = string | Record<string, unknown>;

export interface AssistantMessage {
  role: "assistant";
  content: string | null;
  tool_calls?: ToolCall[];
}

export interface ToolMessage {
  role: "tool";
  content: string;
}

export type Message =
  | { role: "user"; content: string }
  | { role: "system"; content: string }
  | AssistantMessage
  | ToolMessage;

export interface Tool {
  definition: ToolDefinition;
  execute: (args: Record<string, unknown>) => Promise<string> | string;
}

export interface MiddlewareContext {
  messages: Message[];
  tools: Tool[];
  systemPrompt?: string;
}

export interface Middleware {
  beforeAgentRun?: (
    context: MiddlewareContext,
    params?: Record<string, unknown>,
  ) => Promise<void>;
  afterAgentRun?: (
    context: MiddlewareContext,
    params?: Record<string, unknown>,
  ) => Promise<void>;
  beforeToolCall?: (
    context: MiddlewareContext,
    params?: Record<string, unknown>,
  ) => Promise<void>;
  afterToolCall?: (
    context: MiddlewareContext,
    params?: Record<string, unknown>,
  ) => Promise<void>;
  beforeToolExecution?: (
    context: MiddlewareContext,
    params?: Record<string, unknown>,
  ) => Promise<void>;
  afterToolExecution?: (
    context: MiddlewareContext,
    params?: Record<string, unknown>,
  ) => Promise<void>;
}
