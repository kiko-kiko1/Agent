import type { AssistantMessage, ToolCall } from "../types.ts";
import {
  mergeToolCallArguments,
  normalizeToolCallArguments,
} from "./tool-call-utils.ts";

export async function readOllamaStream(
  body: NonNullable<Response["body"]>,
  onChunk?: (chunk: string) => void,
): Promise<AssistantMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";
  let fullToolCalls: ToolCall[] = [];
  let finalRole: "assistant" = "assistant";

  const processStreamLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let data: { message?: AssistantMessage };
    try {
      data = JSON.parse(trimmed) as { message?: AssistantMessage };
    } catch (error) {
      console.warn("[Ollama raw stream parse failed]", {
        line: trimmed,
        error: (error as Error).message,
      });
      return;
    }

    if (!data.message) return;

    const msg = data.message;
    if (msg.role) finalRole = msg.role;

    if (msg.content) {
      fullContent += msg.content;
      onChunk?.(msg.content);
    }

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      for (const [index, tc] of msg.tool_calls.entries()) {
        const incomingArgs = normalizeToolCallArguments(tc.function.arguments);
        const existing = fullToolCalls[index];
        if (existing && existing.function.name === tc.function.name) {
          existing.function.arguments = mergeToolCallArguments(
            existing.function.arguments,
            incomingArgs,
          );
        } else {
          fullToolCalls.push({
            function: {
              name: tc.function.name,
              arguments: incomingArgs,
            },
          });
        }
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      processStreamLine(line);
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    const lines = buffer.split("\n");
    for (const line of lines) {
      processStreamLine(line);
    }
  }

  const message: AssistantMessage = {
    role: finalRole,
    content: fullContent || null,
  };
  if (fullToolCalls.length > 0) {
    message.tool_calls = fullToolCalls;
  }

  return message;
}
