import * as readline from "readline";
import type { Middleware } from "./types.ts";
import fs from "fs/promises";

// 日志上报中间件
export const loggerMiddleware: Middleware = {
  beforeAgentRun: async (context, params) => {
    // console.log("beforeAgentRun", context, params);
    await fs.writeFile(
      "agent.log",
      "beforeAgentRun: " + JSON.stringify(context, null, 2),
      {
        flag: "a",
      },
    );
  },
  afterAgentRun: async (context, params) => {
    console.log("afterAgentRun", context, params);
    await fs.writeFile(
      "agent.log",
      "afterAgentRun: " + JSON.stringify(context, null, 2),
      {
        flag: "a",
      },
    );
  },
};

// 命令执行询问中间件
export const approveMiddleware: Middleware = {
  beforeToolCall: async (context, params) => {
    const confirm = await askUser(`确认调用工具 ${params?.toolName} 吗？`);
    if (confirm.toLowerCase() !== "y") {
      console.log("用户取消调用");
    } else {
      console.log("用户确认调用");
    }
  },
};

// 读取用户的输入
function askUser(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve, reject) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
      rl.close();
    });
  });
}
