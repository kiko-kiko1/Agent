export interface ToolParameter {
  type: string;
  description?: string;
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
    arguments: string;
  };
}

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

export interface AgentConfig {
  model?: string;
  baseUrl?: string;
  stream?: boolean;
}

export class Agent {
  private messages: Message[] = [];
  private tools: Tool[] = [];
  private config: AgentConfig;

  constructor(config: AgentConfig = {}) {
    this.config = {
      model: "qwen2.5:latest",
      baseUrl: "http://localhost:11434/api/chat",
      stream: false,
      ...config,
    };
  }

  addTool(tool: Tool): this {
    this.tools.push(tool);
    return this;
  }

  setSystemPrompt(prompt: string): this {
    const existingIndex = this.messages.findIndex(
      (msg) => msg.role === "system",
    );
    if (existingIndex >= 0) {
      this.messages[existingIndex] = { role: "system", content: prompt };
    } else {
      this.messages.unshift({ role: "system", content: prompt });
    }
    return this;
  }

  private async callModel(
    tools?: ToolDefinition[],
    onChunk?: (chunk: string) => void,
  ): Promise<AssistantMessage> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: this.messages,
      stream: this.config.stream,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    const res = await fetch(this.config.baseUrl!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    let message: AssistantMessage;

    if (this.config.stream && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";
      let fullToolCalls: ToolCall[] = [];
      let finalRole: "assistant" = "assistant";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let data: any;
          try {
            data = JSON.parse(trimmed);
          } catch {
            continue;
          }

          if (data.message) {
            const msg = data.message as AssistantMessage;
            if (msg.role) finalRole = msg.role;

            if (msg.content) {
              fullContent += msg.content;
              onChunk?.(msg.content);
            }

            if (msg.tool_calls && msg.tool_calls.length > 0) {
              for (const tc of msg.tool_calls) {
                const idx = fullToolCalls.findIndex(
                  (t) => t.function.name === tc.function.name,
                );
                if (idx >= 0) {
                  fullToolCalls[idx].function.arguments +=
                    tc.function.arguments || "";
                } else {
                  fullToolCalls.push({
                    function: {
                      name: tc.function.name,
                      arguments: tc.function.arguments || "",
                    },
                  });
                }
              }
            }
          }
        }
      }

      message = {
        role: finalRole,
        content: fullContent || null,
      };
      if (fullToolCalls.length > 0) {
        message.tool_calls = fullToolCalls;
      }
    } else {
      const data = await res.json();
      message = data.message;
    }

    return message;
  }

  private async executeTool(
    toolName: string,
    args: string | Record<string, unknown>,
  ): Promise<string> {
    const tool = this.tools.find(
      (t) => t.definition.function.name === toolName,
    );
    if (!tool) {
      throw new Error(`工具 ${toolName} 不存在`);
    }

    let parsedArgs: Record<string, unknown>;
    if (typeof args === "string") {
      try {
        parsedArgs = JSON.parse(args);
      } catch {
        parsedArgs = {};
      }
    } else {
      parsedArgs = args;
    }

    const result = await tool.execute(parsedArgs);
    return String(result);
  }

  async run(
    userInput: string,
    onChunk?: (chunk: string) => void,
  ): Promise<string> {
    this.messages.push({ role: "user", content: userInput });

    const toolDefinitions = this.tools.map((t) => t.definition);
    let assistantMsg = await this.callModel(toolDefinitions, onChunk);
    this.messages.push(assistantMsg);

    while (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
      for (const toolCall of assistantMsg.tool_calls) {
        const { name: toolName, arguments: args } = toolCall.function;
        const result = await this.executeTool(toolName, args);
        this.messages.push({ role: "tool", content: result });
      }

      assistantMsg = await this.callModel(undefined, onChunk);
      this.messages.push(assistantMsg);
    }

    return assistantMsg.content || "";
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  clearMessages(): this {
    this.messages = this.messages.filter((msg) => msg.role === "system");
    return this;
  }
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
