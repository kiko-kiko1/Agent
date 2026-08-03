import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { resolve } from "path";

export interface SkillMeta {
  name: string;
  description: string;
  skillDir: string; // skill所在的目录
  rawContent: string; // skill的原始内容，给模型使用
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const result: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    result[key] = value;
  }
  return result;
}

export function loadSkillMeta(
  skillsDir = resolve(process.cwd(), "src", "skills"),
): SkillMeta[] {
  const dir = resolve(skillsDir);
  const skills: SkillMeta[] = [];

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    console.warn(`[SkillLoader] 目录不存在：${dir}`);
    return [];
  }
  for (const entry of entries) {
    const entryPath = resolve(dir, entry);
    const skillFile = resolveSkillFile(entryPath);
    if (!skillFile) continue;

    const rawContent = readFileSync(skillFile, "utf-8");
    const frontmatter = parseFrontmatter(rawContent);
    if (!frontmatter.name || !frontmatter.description) continue;

    skills.push({
      name: frontmatter.name,
      description: frontmatter.description,
      skillDir: statSync(entryPath).isDirectory() ? entryPath : dir,
      rawContent,
    });
  }
  return skills;
}

function resolveSkillFile(entryPath: string): string | undefined {
  const stat = statSync(entryPath);
  if (stat.isDirectory()) {
    const skillFile = resolve(entryPath, "SKILL.md");
    return existsSync(skillFile) ? skillFile : undefined;
  }

  if (stat.isFile() && entryPath.endsWith(".SKILL.md")) {
    return entryPath;
  }

  return undefined;
}

export function buildSkillSystemPrompt(skills: SkillMeta[]): string {
  if (skills.length === 0) return "";
  const lines = [
    "## 你拥有以下技能（Skills）",
    "",
    "下面是可用技能索引。Agent 会先根据 name/description 判断是否需要某个技能。",
    "当用户的需求匹配某个技能时，Agent 会在调用模型前加载该技能的完整 SKILL.md。",
    "技能正文是执行指南：请阅读并遵循其中的步骤、约束、输出格式和工具使用说明。",
    "",
  ];
  for (const skill of skills) {
    lines.push(`- **${skill.name}**：${skill.description}`);
  }
  return lines.join("\n");
}
