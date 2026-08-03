import type { Message } from "./types.ts";

export interface ContextUsage {
  totalMessages: number;
  systemMessages: number;
  nonSystemMessages: number;
  estimatedTokens: number;
}

export interface ContextUsageSnapshot {
  raw: ContextUsage;
  sent: ContextUsage;
  summarized: boolean;
}

export function createContextUsageSnapshot(
  rawMessages: Message[],
  sentMessages: Message[],
): ContextUsageSnapshot {
  return {
    raw: getContextUsage(rawMessages),
    sent: getContextUsage(sentMessages),
    summarized: sentMessages.some((msg) =>
      msg.role === "system" && msg.content.startsWith("[历史对话摘要]"),
    ),
  };
}

export function getContextUsage(messages: Message[]): ContextUsage {
  const systemMessages = messages.filter((msg) => msg.role === "system").length;
  const nonSystemMessages = messages.length - systemMessages;

  return {
    totalMessages: messages.length,
    systemMessages,
    nonSystemMessages,
    estimatedTokens: estimateMessagesTokens(messages),
  };
}

function estimateMessagesTokens(messages: Message[]): number {
  return messages.reduce((total, message) => {
    return (
      total + estimateTokens(message.role) + estimateTokens(readContent(message))
    );
  }, 0);
}

function readContent(message: Message): string {
  if (typeof message.content === "string") {
    return message.content;
  }

  if (message.content === null) {
    return "";
  }

  return JSON.stringify(message.content);
}

function estimateTokens(text: string): number {
  if (!text) return 0;

  let tokens = 0;
  let asciiRunLength = 0;

  for (const char of text) {
    if (/[\u4e00-\u9fff]/.test(char)) {
      tokens += Math.ceil(asciiRunLength / 4);
      asciiRunLength = 0;
      tokens += 1;
      continue;
    }

    asciiRunLength += 1;
  }

  return tokens + Math.ceil(asciiRunLength / 4);
}
