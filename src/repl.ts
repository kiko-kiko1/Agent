import readline from "readline";
import { Agent } from "./agent.ts";
import type { ContextUsage } from "./context-usage.ts";
import { buildSkillSystemPrompt, loadSkillMeta } from "./agent/skill-loader.ts";

const skills = loadSkillMeta("./src/skills");
const systemPrompt = buildSkillSystemPrompt(skills);

const agent = new Agent({
  stream: true,
  enableMcpTools: true,
  skills,
});
agent.setSystemPrompt(
  `你是一个软件项目的leader agent，负责协调和管理其他sub-agent。
  你不直接写代码，而是通过委托任务给其他sub-agent来完成项目。code负责写代码,test负责写测试,codeReview负责审查代码。
  遇到复杂任务、包含多个步骤的任务、需要修改代码的任务、需要调研后执行的任务时，必须先做计划：
  1. 先分析目标、约束、风险和验收标准。
  2. 再把任务拆分成明确的待办事项。
  3. 然后调用 write_todos 工具把待办清单写入文件，默认写入 TODOS.md；待办项应使用 pending、in_progress、completed 标记状态，并在 notes 中记录关键验收标准。
  4. 写入待办清单后，再按计划逐步委派给合适的 sub-agent 或调用工具执行。
  简单问答、概念解释、无需执行的澄清类问题可以直接回答，不需要调用 write_todos。
  ${systemPrompt}
`,
);
await agent.connect();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "❯ ",
});

const HELP_TEXT = `
可用命令:
  /help     显示帮助信息
  /clear    清空对话历史（保留系统提示）
  /exit     退出交互式终端
  /model    查看当前使用的模型

直接输入内容即可与 Agent 对话。
`;

function printWelcome() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║     Agent Interactive Terminal       ║");
  console.log("╚══════════════════════════════════════╝");
  console.log("");
  console.log("输入 /help 查看可用命令，输入 /exit 退出。");
  console.log("");
}

function formatUsage(usage: ContextUsage): string {
  return `约 ${usage.estimatedTokens} tokens，${usage.nonSystemMessages} 条非系统消息 / ${usage.systemMessages} 条系统消息`;
}

function printContextUsage() {
  const usage = agent.getContextUsage();
  const lastRequest = usage.lastRequest;

  if (!lastRequest) {
    console.log(`📏 上下文：当前 ${formatUsage(usage.current)}`);
    return;
  }

  if (lastRequest.summarized) {
    console.log(
      `📏 上下文：摘要前 ${formatUsage(lastRequest.raw)} -> 发送给模型 ${formatUsage(lastRequest.sent)}；当前历史 ${formatUsage(usage.current)}`,
    );
    return;
  }

  console.log(
    `📏 上下文：发送给模型 ${formatUsage(lastRequest.sent)}；当前历史 ${formatUsage(usage.current)}`,
  );
}

async function handleCommand(line: string): Promise<boolean> {
  const trimmed = line.trim();

  if (trimmed === "/exit" || trimmed === "/quit" || trimmed === "/q") {
    console.log("👋 再见！");
    rl.close();
    return true;
  }

  if (trimmed === "/help" || trimmed === "/h" || trimmed === "/?") {
    console.log(HELP_TEXT);
    return true;
  }

  if (trimmed === "/clear" || trimmed === "/c") {
    agent.clearMessages();
    console.log("🧹 对话历史已清空");
    return true;
  }

  if (trimmed === "/model") {
    console.log(`🤖 当前模型: ${(agent as any).config.model}`);
    return true;
  }

  return false;
}

async function processInput(line: string) {
  const isCommand = await handleCommand(line);
  if (isCommand) return;

  if (!line.trim()) return;

  try {
    console.log("对话中");
    console.log("🤖 Agent:");

    let hasStreamedChunk = false;
    const result = await agent.run(line, (chunk) => {
      hasStreamedChunk = true;
      process.stdout.write(chunk);
    });
    if (!hasStreamedChunk && result) {
      process.stdout.write(result);
    }

    console.log("");
    printContextUsage();
    console.log("");
  } catch (error) {
    console.error("");
    console.error("❌ 错误:", (error as Error).message);
    console.log("");
  }
}

printWelcome();
rl.prompt();

rl.on("line", async (line: string) => {
  console.log("🚀 ~ line:", line);
  rl.pause();
  await processInput(line);
  rl.prompt();
});

rl.on("close", () => {
  process.exit(0);
});
