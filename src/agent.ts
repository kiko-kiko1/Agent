import {
  Middleware,
  MiddlewareContext,
  ToolParameter,
  ToolDefinition,
  ToolCall,
  AssistantMessage,
  ToolMessage,
  Message,
  Tool,
} from "./types.ts";
import { trimMessage } from "./context.ts";
import {
  ContextUsageSnapshot,
  createContextUsageSnapshot,
  getContextUsage,
} from "./context-usage.ts";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio";
import { Client } from "@modelcontextprotocol/sdk/client";
import { McpTool } from "./mcp/mcp-server.ts";
import type { SkillMeta } from "./agent/skill-loader.ts";
import { readOllamaStream } from "./agent/ollama-stream.ts";
import {
  normalizeToolArguments,
  stringifyToolResult,
} from "./agent/tool-call-utils.ts";
import { inspect } from "node:util";

export interface AgentConfig {
  model?: string;
  baseUrl?: string;
  stream?: boolean;
  middleware?: Middleware[];
  systemPrompt?: string;
  tools?: Tool[];
  maxSteps?: number;
  enableMcpTools?: boolean;
  skills?: SkillMeta[];
}

export class Agent {
  private messages: Message[] = [];
  private tools: Tool[] = [];
  private config: AgentConfig;
  private mcpClient: Client;
  private mcpTools: McpTool[] = [];
  private lastContextUsageSnapshot?: ContextUsageSnapshot;
  private loadedSkillNames = new Set<string>();

  constructor(config: AgentConfig = {}) {
    this.config = {
      model: "qwen2.5:latest",
      baseUrl: "http://localhost:11434/api/chat",
      stream: false,
      middleware: [],
      systemPrompt: undefined,
      tools: [],
      maxSteps: 10,
      enableMcpTools: true,
      ...config,
    };
    this.mcpClient = new Client({ name: "mini-helixent", version: "1.0.0" });
    if (this.config.tools) {
      this.tools.push(...this.config.tools);
    }
  }

  async connect() {
    if (!this.config.enableMcpTools) {
      return;
    }

    // 连接mcp server
    const transport = new StdioClientTransport({
      command: "npx",
      args: ["tsx", "src/mcp/mcp-server.ts"],
    });

    await this.mcpClient.connect(transport);

    const { tools } = await this.mcpClient.listTools();
    this.mcpTools = tools as McpTool[];
    console.log(
      `[MCP] 已连接，加载工具：${this.mcpTools.map((t) => t.name).join(", ")}`,
    );
  }

  addTool(tool: Tool): this {
    this.tools.push(tool);
    return this;
  }

  private async selectSkillForInput(
    userInput: string,
  ): Promise<SkillMeta | undefined> {
    const skills = this.config.skills;
    if (!skills || skills.length === 0) return undefined;

    const skillIndex = skills
      .map((skill) => `- ${skill.name}: ${skill.description}`)
      .join("\n");
    const res = await fetch(this.config.baseUrl!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.config.model,
        stream: false,
        messages: [
          {
            role: "system",
            content: [
              "你是一个 Skill 路由器。",
              "你只能根据用户输入和 Skill 的 name/description 判断是否需要使用 Skill。",
              '如果需要，返回严格 JSON：{"skillName":"<name>"}。',
              '如果不需要，返回严格 JSON：{"skillName":null}。',
              "不要输出任何解释、Markdown 或代码块。",
              "",
              "可用 Skills：",
              skillIndex,
            ].join("\n"),
          },
          { role: "user", content: userInput },
        ],
      }),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(`Skill 路由失败：${res.status} ${errorText}`);
    }

    const data = await res.json();
    const content = String(data.message?.content ?? "").trim();
    const jsonText = content.match(/\{[\s\S]*\}/)?.[0] ?? content;

    try {
      const parsed = JSON.parse(jsonText) as { skillName?: unknown };
      if (typeof parsed.skillName !== "string") return undefined;
      return skills.find((skill) => skill.name === parsed.skillName);
    } catch {
      return undefined;
    }
  }

  private injectSkill(skill: SkillMeta): boolean {
    if (this.loadedSkillNames.has(skill.name)) {
      return false;
    }

    console.log(`[Agent] 加载技能：${skill.name}`);
    this.messages.push({
      role: "system",
      content: [
        `[技能 ${skill.name} 完整说明]`,
        `SKILL_DIR：${skill.skillDir}`,
        skill.rawContent,
      ].join("\n"),
    });
    this.loadedSkillNames.add(skill.name);
    return true;
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

  setMiddleware(middlewares: Middleware[]): this {
    this.config.middleware && this.config.middleware.push(...middlewares);
    return this;
  }

  private async callModel(
    onChunk?: (chunk: string) => void,
    includeMcpTools = true,
  ): Promise<AssistantMessage> {
    // 处理message
    const contextMessage = await trimMessage(this.messages);
    console.log(
      "🚀 ~ Agent ~ callModel ~ this.messages:",
      inspect(this.messages, {
        depth: null,
        colors: true,
        maxArrayLength: null,
        maxStringLength: null,
      }),
    );
    this.lastContextUsageSnapshot = createContextUsageSnapshot(
      this.messages,
      contextMessage,
    );
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: contextMessage,
      stream: this.config.stream,
    };

    if (
      includeMcpTools &&
      this.config.enableMcpTools &&
      this.mcpTools.length > 0
    ) {
      body.tools = this.mcpTools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      }));
    }

    const res = await fetch(this.config.baseUrl!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(`HTTP error! status: ${res.status} ${errorText}`);
    }

    let message: AssistantMessage;

    if (this.config.stream && res.body) {
      message = await readOllamaStream(res.body, onChunk);
    } else {
      const data = await res.json();
      message = data.message;
    }

    if (!message.content && !message.tool_calls?.length) {
      message.content = "模型返回了空响应，请换个说法再试。";
    }

    return message;
  }

  private async runMiddleware<T extends keyof Middleware>(
    hook: T,
    context: MiddlewareContext,
    params?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.config.middleware) return;

    for (const mid of this.config.middleware) {
      const handler = mid[hook];
      if (handler) {
        await handler(context, params);
      }
    }
  }

  async run(
    userInput: string,
    onChunk?: (chunk: string) => void,
  ): Promise<string> {
    const matchedSkill = await this.selectSkillForInput(userInput);
    if (matchedSkill) {
      this.injectSkill(matchedSkill);
    }

    this.messages.push({ role: "user", content: userInput });
    this.runMiddleware("beforeAgentRun", {
      messages: this.messages,
      tools: this.tools,
      systemPrompt: this.config.systemPrompt,
    });

    let assistantMsg = await this.callModel(onChunk);
    this.messages.push(assistantMsg);

    const maxToolCalls = this.config.maxSteps || 10;
    let toolCallCount = 0;

    while (
      assistantMsg.tool_calls &&
      assistantMsg.tool_calls.length > 0 &&
      toolCallCount < maxToolCalls
    ) {
      const toolMessages = await Promise.all(
        assistantMsg.tool_calls.map(async (toolCall): Promise<ToolMessage> => {
          const { arguments: args } = toolCall.function;
          const result = await this.mcpClient.callTool({
            name: toolCall.function.name,
            arguments: normalizeToolArguments(args),
          });
          return {
            role: "tool",
            content: stringifyToolResult(result),
          };
        }),
      );

      this.messages.push(...toolMessages);

      assistantMsg = await this.callModel(onChunk);
      this.messages.push(assistantMsg);
      toolCallCount++;
    }

    if (toolCallCount >= maxToolCalls) {
      throw new Error("工具调用次数超过上限，可能存在死循环");
    }

    this.runMiddleware("afterAgentRun", {
      messages: this.messages,
      tools: this.tools,
      systemPrompt: this.config.systemPrompt,
    });

    return assistantMsg.content || "";
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  getContextUsage() {
    return {
      current: getContextUsage(this.messages),
      lastRequest: this.lastContextUsageSnapshot,
    };
  }

  async callMcpTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    const result = await this.mcpClient.callTool({ name, arguments: args });
    return stringifyToolResult(result);
  }

  clearMessages(): this {
    this.messages = this.messages.filter(
      (msg) =>
        msg.role === "system" &&
        !msg.content.startsWith("[技能 ") &&
        !msg.content.includes("完整说明]"),
    );
    this.lastContextUsageSnapshot = undefined;
    this.loadedSkillNames.clear();
    return this;
  }
}

export { createTool } from "./agent/tool-call-utils.ts";

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
