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
      (msg) => msg.role === "system"
    );
    if (existingIndex >= 0) {
      this.messages[existingIndex] = { role: "system", content: prompt };
    } else {
      this.messages.unshift({ role: "system", content: prompt });
    }
    return this;
  }

  private async callModel(tools?: ToolDefinition[]): Promise<AssistantMessage> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: this.messages,
      stream: this.config.stream,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    const res = await fetch(this.config.baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return data.message;
  }

  private async executeTool(toolName: string, args: string): Promise<string> {
    const tool = this.tools.find((t) => t.definition.function.name === toolName);
    if (!tool) {
      throw new Error(`工具 ${toolName} 不存在`);
    }

    let parsedArgs: Record<string, unknown>;
    try {
      parsedArgs = JSON.parse(args);
    } catch {
      parsedArgs = {};
    }

    const result = await tool.execute(parsedArgs);
    return String(result);
  }

  async run(userInput: string): Promise<string> {
    this.messages.push({ role: "user", content: userInput });

    const toolDefinitions = this.tools.map((t) => t.definition);
    let assistantMsg = await this.callModel(toolDefinitions);
    this.messages.push(assistantMsg);

    while (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
      for (const toolCall of assistantMsg.tool_calls) {
        const { name: toolName, arguments: args } = toolCall.function;
        const result = await this.executeTool(toolName, args);
        this.messages.push({ role: "tool", content: result });
      }

      assistantMsg = await this.callModel();
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
  execute: (args: Record<string, unknown>) => Promise<string> | string
): Tool {
  const required = Object.entries(parameters)
    .filter(([, param]) => param.type !== "string" || param.description)
    .map(([key]) => key);

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