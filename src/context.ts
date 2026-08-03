import { Message } from "./types.ts";

let maxMessages = 50;
export const trimMessage = async (messages: Message[]) => {
  const systemMessages = messages.filter((msg) => msg.role == "system");
  let nonSystemMessages = messages.filter((msg) => msg.role !== "system");

  const windowSizeMessage = {
    role: "system" as const,
    content: `[系统提示] 当前上下文窗口大小：最多保留 ${maxMessages} 条非系统消息，超出部分将被摘要处理。`,
  };

  if (nonSystemMessages.length <= maxMessages) {
    return [...messages, windowSizeMessage];
  }

  let contextMessages = nonSystemMessages.slice(-maxMessages);
  let summaryMessages = nonSystemMessages.slice(0, maxMessages);
  const summaryText = await callSummaryMessagesModel(summaryMessages);
  const summaryMessage = {
    role: "system" as const,
    content: "[历史对话摘要]" + summaryText,
  };

  return [
    ...systemMessages,
    summaryMessage,
    ...contextMessages,
    windowSizeMessage,
  ];
};

async function callSummaryMessagesModel(
  summaryMessages: Message[],
): Promise<string> {
  const summaryText = summaryMessages
    .map((msg) =>
      msg.role + "：" + typeof msg.content === "string"
        ? msg.content
        : JSON.stringify(msg.content),
    )
    .join("\n");

  const res = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "qwen2.5:latest",
      messages: [
        {
          role: "user",
          content: `请用简洁的中文总结以下对话的关键信息，保留重要决策和上下文，控制在200字以内：\n\n${summaryText}`,
        },
      ],
      stream: false,
    }),
  });
  const data = await res.json();
  return data.message.content || "摘要生成失败";
}
