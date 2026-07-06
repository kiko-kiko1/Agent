// src/run.ts
import { Agent } from "./agent.js";
import { tools } from "./tools.js";

const agent = new Agent();
agent.setSystemPrompt(
  "你是一个文件操作助手，可以读取文件、写入文件、列出目录结构和执行 shell 命令。",
);
tools.forEach((tool) => agent.addTool(tool));

const result = await agent.run(
  "帮我列出当前目录的文件结构，并且读一下agent.ts文件的内容",
);
console.log("✅ 最终回答：", result);
