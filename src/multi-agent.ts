import { Agent, createTool, type Tool } from "./agent.ts";
import {
  bashTool,
  listFilesTool,
  readFileTool,
  writeFileTool,
} from "./tools.ts";

// Coder Agent：专门写代码
const coderAgent = new Agent({
  systemPrompt: `你是一个专业的代码编写专家。
你的职责是根据需求编写高质量的代码，并保存到对应文件。
工作目录是当前命令行所在的目录。`,
  tools: [readFileTool, writeFileTool, listFilesTool],
  model: "qwen2.5:latest",
  maxSteps: 5,
});
// Tester Agent：专门写测试和执行命令
const testerAgent = new Agent({
  systemPrompt: `你是一个专业的测试工程师。
你的职责是为代码编写单元测试，并执行验证。
工作目录是当前命令行所在的目录。`,
  tools: [readFileTool, writeFileTool, bashTool],
  model: "qwen2.5:latest",
  maxSteps: 5,
});

const codeReviewAgent = new Agent({
  systemPrompt: `你是一个专业的代码审查工程师。
你的职责是审查代码并提供反馈。
工作目录是当前命令行所在的目录。`,
  tools: [readFileTool, writeFileTool, listFilesTool],
  model: "qwen2.5:latest",
  maxSteps: 5,
});

export const subAgents: Record<string, Agent> = {
  code: coderAgent,
  test: testerAgent,
  codeReview: codeReviewAgent,
};

export const delegateTool: Tool = createTool(
  "delegate",
  "把子任务委派给其他sub-agent,code负责写代码,test负责写测试,codeReview负责审查代码",
  {
    agent: {
      type: "string",
      enum: ["code", "test", "codeReview"],
      description: "要委托给的智能体名称",
    },
    task: {
      type: "string",
      description: "要委托的任务",
    },
  },
  async ({ agent, task }) => {
    const subAgent = subAgents[agent as keyof typeof subAgents];
    if (!subAgent) {
      return `智能体 ${agent} 不存在`;
    }
    await subAgent.run(String(task as unknown as string));
    return `委托给 ${agent} 执行任务: ${task}`;
  },
);
