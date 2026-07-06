// src/demo.ts
// 目标：用 Ollama + qwen2.5 完成一次完整的 tool calling 流程

// ── 1. 定义一个工具（获取当前时间）──────────────────────────────
const getTimeTool = {
  type: "function" as const,
  function: {
    name: "get_current_time",
    description: "获取当前时间",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

// 工具的实际执行逻辑
function get_current_time(): string {
  return new Date().toLocaleString("zh-CN");
}

// ── 2. 消息列表（这就是 Agent 的核心状态）────────────────────────
const messages: any[] = [{ role: "user", content: "现在几点了？" }];

// ── 3. 第一次调模型（模型决定要不要用工具）──────────────────────
console.log("📤 第一次请求模型...");
const res1 = await fetch("http://localhost:11434/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "qwen2.5:latest",
    messages,
    tools: [getTimeTool],
    stream: false,
  }),
});

const data1 = await res1.json();
const assistantMsg = data1.message;
console.log("📥 模型回复：", JSON.stringify(assistantMsg, null, 2));

// ── 4. 判断模型是否要调工具 ──────────────────────────────────────
if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
  console.log("\n🔧 模型要调工具！");

  // 把模型的 assistant 消息加入列表
  messages.push(assistantMsg);

  // 执行每个工具调用
  for (const toolCall of assistantMsg.tool_calls) {
    const toolName = toolCall.function.name;
    console.log(`  → 执行工具: ${toolName}`);

    // 执行工具，拿到结果
    const result = get_current_time();
    console.log(`  → 工具结果: ${result}`);

    // 把工具结果作为 tool 消息加入列表
    messages.push({
      role: "tool",
      content: result,
    });
  }

  // ── 5. 第二次调模型（带上工具结果，让模型给出最终回答）─────────
  console.log("\n📤 第二次请求模型（带工具结果）...");
  const res2 = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "qwen2.5:latest",
      messages,
      stream: false,
    }),
  });

  const data2 = await res2.json();
  console.log("\n✅ 最终回答：", data2.message.content);
} else {
  // 模型直接回答，没用工具
  console.log("\n✅ 模型直接回答：", assistantMsg.content);
}
