import readline from "readline";
import { Agent } from "./agent.js";
import { tools } from "./tools.js";

const agent = new Agent({ stream: true });
agent.setSystemPrompt(
  "你是一个文件操作助手，可以读取文件、写入文件、列出目录结构和执行 shell 命令。",
);
tools.forEach((tool) => agent.addTool(tool));

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
    console.log("");
    console.log("🤖 Agent:");

    const result = await agent.run(line, (chunk) => {
      process.stdout.write(chunk);
    });

    console.log("");
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
  rl.pause();
  await processInput(line);
  rl.prompt();
});

rl.on("close", () => {
  process.exit(0);
});
