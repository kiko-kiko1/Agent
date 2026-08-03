import { createTool, type Tool } from "./agent.ts";
import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const readFileTool: Tool = createTool(
  "read_file",
  "读取指定路径的文件内容",
  {
    file_path: {
      type: "string",
      description: "文件的相对路径或绝对路径",
    },
  },
  async (res) => {
    const { file_path } = res;
    console.log("要读的文件地址file_path:", res, file_path);
    try {
      const filePath = String(file_path);
      const resolvedPath = path.resolve(filePath);
      const content = await fs.readFile(resolvedPath, "utf-8");
      return content;
    } catch (error) {
      return `读取文件失败: ${(error as Error).message}`;
    }
  },
);

export const writeFileTool: Tool = createTool(
  "write_file",
  "写入文件",
  {
    file_path: {
      type: "string",
      description: "要写入的文件路径",
    },
    content: {
      type: "string",
      description: "要写入的文件内容",
    },
  },
  async ({ file_path, content }) => {
    try {
      const filePath = String(file_path);
      const resolvedPath = path.resolve(filePath);
      await fs.writeFile(resolvedPath, String(content), "utf-8");
      return `文件写入成功: ${resolvedPath}`;
    } catch (error) {
      return `写入文件失败: ${(error as Error).message}`;
    }
  },
);

export const listFilesTool: Tool = createTool(
  "list_files",
  "列出目录结构",
  {
    directory: {
      type: "string",
      description: "要列出的目录路径",
    },
  },
  async ({ directory }) => {
    try {
      const dirPath = String(directory || ".");
      const resolvedPath = path.resolve(dirPath);
      const files = await fs.readdir(resolvedPath, { withFileTypes: true });

      let result = `目录: ${resolvedPath}\n`;
      result += "──────────────────────────────\n";

      for (const file of files) {
        const type = file.isDirectory() ? "📁" : "📄";
        const size = file.isFile()
          ? (await fs.stat(path.join(resolvedPath, file.name))).size
          : "-";
        result += `${type} ${file.name} (${size} bytes)\n`;
      }

      return result;
    } catch (error) {
      return `列出目录失败: ${(error as Error).message}`;
    }
  },
);

export const bashTool: Tool = createTool(
  "bash",
  "执行 shell 命令",
  {
    command: {
      type: "string",
      description: "要执行的 shell 命令",
    },
  },
  async ({ command }) => {
    try {
      const cmd = String(command);
      const { stdout, stderr } = await execAsync(cmd);
      if (stderr) {
        return `命令执行完成（有错误输出）:\nstdout: ${stdout}\nstderr: ${stderr}`;
      }
      return `命令执行成功:\n${stdout}`;
    } catch (error) {
      const err = error as Error & { stdout?: string; stderr?: string };
      return `命令执行失败: ${err.message}\nstderr: ${err.stderr || ""}`;
    }
  },
);

export const tools: Tool[] = [
  readFileTool,
  writeFileTool,
  listFilesTool,
  bashTool,
];
