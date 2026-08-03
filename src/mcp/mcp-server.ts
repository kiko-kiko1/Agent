// src/mcp-server.ts
// 一个最小的 MCP Server，通过 stdio 通信
// 暴露工具：read_file、list_files、bash、web_search、fetch_url、get_weather、write_todos

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";

// MCP 返回的工具描述
export interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

const server = new McpServer({
  name: "mini-helixent-tools",
  version: "1.0.0",
});

const execAsync = promisify(exec);

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };

  return value
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => {
      return namedEntities[name] ?? match;
    });
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function normalizeDuckDuckGoUrl(rawUrl: string): string {
  const decodedUrl = decodeHtmlEntities(rawUrl);
  try {
    const parsed = new URL(decodedUrl, "https://duckduckgo.com");
    const redirectedUrl = parsed.searchParams.get("uddg");
    if (redirectedUrl) {
      return redirectedUrl;
    }
    return parsed.toString();
  } catch {
    return decodedUrl;
  }
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": DEFAULT_USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  return res.text();
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": DEFAULT_USER_AGENT,
      Accept: "application/json",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as T;
}

function parseDuckDuckGoResults(html: string, maxResults: number) {
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  const resultRegex =
    /<div class="result[\s\S]*?<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>|<div[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/div>)/gi;

  for (const match of html.matchAll(resultRegex)) {
    const title = stripHtml(match[2] ?? "");
    const url = normalizeDuckDuckGoUrl(match[1] ?? "");
    const snippet = stripHtml(match[3] ?? match[4] ?? "");

    if (!title || !url) continue;
    results.push({ title, url, snippet });

    if (results.length >= maxResults) break;
  }

  return results;
}

function extractReadableText(html: string, maxChars: number): string {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripHtml(titleMatch[1]) : "";
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const body = stripHtml(bodyMatch?.[1] ?? html);
  const text = [title, body].filter(Boolean).join("\n\n");
  return text.slice(0, maxChars);
}

function getWeatherDescription(code: number): string {
  const weatherCodes: Record<number, string> = {
    0: "晴",
    1: "大部晴朗",
    2: "局部多云",
    3: "阴",
    45: "雾",
    48: "雾凇",
    51: "小毛毛雨",
    53: "中等毛毛雨",
    55: "大毛毛雨",
    56: "小冻毛毛雨",
    57: "大冻毛毛雨",
    61: "小雨",
    63: "中雨",
    65: "大雨",
    66: "小冻雨",
    67: "大冻雨",
    71: "小雪",
    73: "中雪",
    75: "大雪",
    77: "雪粒",
    80: "小阵雨",
    81: "中等阵雨",
    82: "强阵雨",
    85: "小阵雪",
    86: "大阵雪",
    95: "雷暴",
    96: "雷暴伴小冰雹",
    99: "雷暴伴大冰雹",
  };

  return weatherCodes[code] ?? `未知天气码 ${code}`;
}

interface GeocodingResult {
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
}

interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  current_units?: Record<string, string>;
  current: {
    time: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    precipitation: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
  };
  daily_units?: Record<string, string>;
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max?: number[];
  };
}

type TodoStatus = "pending" | "in_progress" | "completed";
type TodoPriority = "low" | "medium" | "high";

interface TodoItem {
  content: string;
  status?: TodoStatus;
  priority?: TodoPriority;
  notes?: string;
}

function formatTodosMarkdown(title: string, todos: TodoItem[]): string {
  const statusMarkers: Record<TodoStatus, string> = {
    pending: " ",
    in_progress: "-",
    completed: "x",
  };
  const statusLabels: Record<TodoStatus, string> = {
    pending: "待处理",
    in_progress: "进行中",
    completed: "已完成",
  };
  const priorityLabels: Record<TodoPriority, string> = {
    low: "低",
    medium: "中",
    high: "高",
  };

  const lines = [`# ${title}`, ""];

  for (const todo of todos) {
    const status = todo.status ?? "pending";
    const priority = todo.priority
      ? ` priority: ${priorityLabels[todo.priority]}`
      : "";
    lines.push(
      `- [${statusMarkers[status]}] ${todo.content} (${statusLabels[status]}${priority})`,
    );

    if (todo.notes) {
      lines.push(`  - 备注：${todo.notes}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

// ── 工具 1：read_file ─────────────────────────────────────────
server.tool(
  "read_file",
  "读取指定路径的文件内容",
  {
    file_path: z.string().describe("要读取的文件路径"),
  },
  async ({ file_path }) => {
    try {
      const content = fs.readFileSync(path.resolve(file_path), "utf-8");
      return {
        content: [{ type: "text", text: content }],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `错误：${(e as Error).message}` }],
        isError: true,
      };
    }
  },
);

// ── 工具 2：list_files ────────────────────────────────────────
server.tool(
  "list_files",
  "列出指定目录下的文件",
  {
    dir_path: z.string().describe("要列出的目录路径"),
  },
  async ({ dir_path }) => {
    try {
      const files = fs.readdirSync(path.resolve(dir_path));
      return {
        content: [{ type: "text", text: files.join("\n") }],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `错误：${(e as Error).message}` }],
        isError: true,
      };
    }
  },
);

// ── 工具 3：bash ──────────────────────────────────────────────
server.tool(
  "bash",
  "执行 bash 命令。用于运行 Skill 脚本，例如 bash ${SKILL_DIR}/scripts/run.sh。",
  {
    command: z.string().describe("要执行的 bash 命令"),
    cwd: z
      .string()
      .optional()
      .describe("命令执行目录。未提供时使用当前工作目录。"),
    timeoutMs: z
      .number()
      .int()
      .positive()
      .max(30000)
      .optional()
      .describe("超时时间，单位毫秒，最大 30000。"),
  },
  async ({ command, cwd, timeoutMs }) => {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: cwd ? path.resolve(cwd) : process.cwd(),
        shell: "/bin/bash",
        timeout: timeoutMs ?? 10000,
      });
      const output = [stdout, stderr].filter(Boolean).join("\n");
      return {
        content: [{ type: "text", text: output || "命令执行完成，无输出。" }],
      };
    } catch (e) {
      const error = e as Error & { stdout?: string; stderr?: string };
      const output = [error.stdout, error.stderr, error.message]
        .filter(Boolean)
        .join("\n");
      return {
        content: [{ type: "text", text: output }],
        isError: true,
      };
    }
  },
);

// ── 工具 4：web_search ───────────────────────────────────────
server.tool(
  "web_search",
  "联网搜索公开网页。适合查询实时信息、资料来源、新闻、文档和需要外部知识的问题。",
  {
    query: z.string().min(1).describe("搜索关键词或问题"),
    maxResults: z
      .number()
      .int()
      .positive()
      .max(10)
      .optional()
      .describe("返回结果数量，默认 5，最大 10。"),
  },
  async ({ query, maxResults }) => {
    try {
      const limit = maxResults ?? 5;
      const searchUrl = new URL("https://html.duckduckgo.com/html/");
      searchUrl.searchParams.set("q", query);

      const html = await fetchText(searchUrl.toString());
      const results = parseDuckDuckGoResults(html, limit);

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `未搜索到结果。查询：${query}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                query,
                results,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (e) {
      return {
        content: [
          { type: "text", text: `网络搜索失败：${(e as Error).message}` },
        ],
        isError: true,
      };
    }
  },
);

// ── 工具 5：fetch_url ─────────────────────────────────────────
server.tool(
  "fetch_url",
  "读取公开网页内容，并返回清理后的正文片段。适合在 web_search 后打开具体结果。",
  {
    url: z.string().url().describe("要读取的公开网页 URL"),
    maxChars: z
      .number()
      .int()
      .positive()
      .max(20000)
      .optional()
      .describe("最多返回字符数，默认 8000，最大 20000。"),
  },
  async ({ url, maxChars }) => {
    try {
      const html = await fetchText(url);
      const text = extractReadableText(html, maxChars ?? 8000);
      return {
        content: [
          { type: "text", text: text || "网页读取完成，但未提取到正文。" },
        ],
      };
    } catch (e) {
      return {
        content: [
          { type: "text", text: `网页读取失败：${(e as Error).message}` },
        ],
        isError: true,
      };
    }
  },
);

// ── 工具 6：get_weather ───────────────────────────────────────
server.tool(
  "get_weather",
  "根据地址获取实时天气和未来几天天气预报。输入城市、区县、街道或完整地址均可。",
  {
    address: z
      .string()
      .min(1)
      .describe("要查询天气的地址，例如：北京、上海市徐汇区、杭州市西湖区。"),
    forecastDays: z
      .number()
      .int()
      .positive()
      .max(7)
      .optional()
      .describe("预报天数，默认 3，最大 7。"),
  },
  async ({ address, forecastDays }) => {
    try {
      const geocodeUrl = new URL("https://nominatim.openstreetmap.org/search");
      geocodeUrl.searchParams.set("format", "jsonv2");
      geocodeUrl.searchParams.set("q", address);
      geocodeUrl.searchParams.set("limit", "1");
      geocodeUrl.searchParams.set("accept-language", "zh-CN");

      const geocodingResults = await fetchJson<GeocodingResult[]>(
        geocodeUrl.toString(),
      );
      const location = geocodingResults[0];

      if (!location) {
        return {
          content: [
            {
              type: "text",
              text: `未能识别地址：${address}`,
            },
          ],
          isError: true,
        };
      }

      const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
      weatherUrl.searchParams.set("latitude", location.lat);
      weatherUrl.searchParams.set("longitude", location.lon);
      weatherUrl.searchParams.set(
        "current",
        [
          "temperature_2m",
          "relative_humidity_2m",
          "apparent_temperature",
          "precipitation",
          "weather_code",
          "wind_speed_10m",
          "wind_direction_10m",
        ].join(","),
      );
      weatherUrl.searchParams.set(
        "daily",
        [
          "weather_code",
          "temperature_2m_max",
          "temperature_2m_min",
          "precipitation_probability_max",
        ].join(","),
      );
      weatherUrl.searchParams.set("timezone", "auto");
      weatherUrl.searchParams.set("forecast_days", String(forecastDays ?? 3));

      const weather = await fetchJson<OpenMeteoResponse>(weatherUrl.toString());
      const current = weather.current;
      const daily = weather.daily;

      const result = {
        queryAddress: address,
        resolvedLocation: {
          name: location.name,
          displayName: location.display_name,
          latitude: Number(location.lat),
          longitude: Number(location.lon),
          timezone: weather.timezone,
        },
        current: {
          time: current.time,
          weather: getWeatherDescription(current.weather_code),
          weatherCode: current.weather_code,
          temperature: `${current.temperature_2m}${weather.current_units?.temperature_2m ?? "°C"}`,
          apparentTemperature: `${current.apparent_temperature}${weather.current_units?.apparent_temperature ?? "°C"}`,
          humidity: `${current.relative_humidity_2m}${weather.current_units?.relative_humidity_2m ?? "%"}`,
          precipitation: `${current.precipitation}${weather.current_units?.precipitation ?? "mm"}`,
          windSpeed: `${current.wind_speed_10m}${weather.current_units?.wind_speed_10m ?? "km/h"}`,
          windDirection: `${current.wind_direction_10m}${weather.current_units?.wind_direction_10m ?? "°"}`,
        },
        forecast: daily
          ? daily.time.map((date, index) => ({
              date,
              weather: getWeatherDescription(daily.weather_code[index]),
              weatherCode: daily.weather_code[index],
              temperatureMax: `${daily.temperature_2m_max[index]}${weather.daily_units?.temperature_2m_max ?? "°C"}`,
              temperatureMin: `${daily.temperature_2m_min[index]}${weather.daily_units?.temperature_2m_min ?? "°C"}`,
              precipitationProbability:
                daily.precipitation_probability_max?.[index] === undefined
                  ? undefined
                  : `${daily.precipitation_probability_max[index]}${weather.daily_units?.precipitation_probability_max ?? "%"}`,
            }))
          : [],
        sources: {
          geocoding: "https://nominatim.openstreetmap.org/",
          weather: "https://open-meteo.com/",
        },
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (e) {
      return {
        content: [
          { type: "text", text: `天气查询失败：${(e as Error).message}` },
        ],
        isError: true,
      };
    }
  },
);

// ── 工具 7：write_todos ───────────────────────────────────────
server.tool(
  "write_todos",
  "写入结构化待办清单。适合在拆解任务、制定执行计划或记录 pending tasks 时使用。",
  {
    todos: z
      .array(
        z.object({
          content: z.string().min(1).describe("待办内容"),
          status: z
            .enum(["pending", "in_progress", "completed"])
            .optional()
            .describe("待办状态，默认 pending。"),
          priority: z
            .enum(["low", "medium", "high"])
            .optional()
            .describe("优先级，可选 low、medium、high。"),
          notes: z.string().optional().describe("补充说明或验收标准。"),
        }),
      )
      .min(1)
      .describe("待办事项列表"),
    title: z.string().optional().describe("待办清单标题，默认 Todos。"),
    file_path: z
      .string()
      .optional()
      .describe("写入文件路径，默认 ./TODOS.md。支持相对路径和绝对路径。"),
    mode: z
      .enum(["overwrite", "append"])
      .optional()
      .describe("写入模式，默认 overwrite；append 会追加到文件末尾。"),
  },
  async ({ todos, title, file_path, mode }) => {
    try {
      const targetPath = path.resolve(file_path ?? "TODOS.md");
      const content = formatTodosMarkdown(title ?? "Todos", todos);

      fs.mkdirSync(path.dirname(targetPath), { recursive: true });

      if (mode === "append" && fs.existsSync(targetPath)) {
        fs.appendFileSync(targetPath, `\n${content}`, "utf-8");
      } else {
        fs.writeFileSync(targetPath, content, "utf-8");
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                filePath: targetPath,
                mode: mode ?? "overwrite",
                count: todos.length,
                message: "待办清单写入完成。",
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (e) {
      return {
        content: [
          { type: "text", text: `待办清单写入失败：${(e as Error).message}` },
        ],
        isError: true,
      };
    }
  },
);

// ── 启动 ──────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("MCP Server 已启动（stdio）");
