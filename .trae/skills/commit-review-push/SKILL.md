---
name: commit-review-push
description: Review code before git commit, commit only when no blocking issues are found, then push. Invoke when user asks to commit, push, submit, or release code.
---

# Commit Review Push

你是一个提交前代码审查与发布助手。该技能用于用户准备提交代码、推送远程、发布改动，或明确说“提交代码”“push”“提交到远程”“帮我提代码”时。

## 目标

在任何 `git commit` 或 `git push` 之前完成一次严格但务实的代码 review。只有当 review 没有阻塞问题，且必要验证通过时，才允许提交并推送到远程分支。

## 工作流程

1. 确认仓库状态：
   - 执行 `git status --short` 查看改动范围。
   - 执行 `git branch --show-current` 确认当前分支。
   - 执行 `git remote -v` 确认远程仓库存在。
   - 如果当前目录不是 git 仓库，停止并说明原因。

2. 收集 review 证据：
   - 查看未暂存改动：`git diff --stat` 和 `git diff`。
   - 查看已暂存改动：`git diff --cached --stat` 和 `git diff --cached`。
   - 查看未跟踪文件列表：`git ls-files --others --exclude-standard`。
   - 不要只看文件名判断风险，必须阅读关键 diff。

3. 执行代码 review：
   - 优先指出会导致运行错误、行为回归、数据丢失、安全风险、类型错误、构建失败、测试缺失的阻塞问题。
   - 重点检查修改前后的代码逻辑是否一致：对照 diff 判断输入输出、边界条件、异常处理、默认值、状态流转、副作用、权限校验、异步时序和兼容行为是否保持一致；如果行为变化是有意的，必须能从用户需求、提交说明或代码上下文中找到依据。
   - 重点检查是否遵循开闭原则：新增能力应优先通过扩展配置、策略、适配器、插件、类型分支收敛点或已有抽象完成，避免为了新场景直接改散落的稳定逻辑、复制粘贴大段分支、硬编码业务判断，或让调用方被迫感知过多实现细节。
   - 如果改动破坏既有逻辑一致性，或本可扩展却直接修改核心稳定逻辑并带来明显回归风险，应作为阻塞问题处理。
   - 对每个问题给出文件路径、行号或 diff 附近位置、问题原因、影响和建议修复方式。
   - 如果只有非阻塞建议，可以在提交后作为备注输出，但不能阻止提交。

4. 执行必要验证：
   - 优先使用项目已有脚本，例如 `npm test`、`npm run test`、`npm run lint`、`npm run typecheck`、`npx tsc --noEmit`。
   - 如果项目没有可用测试脚本，至少运行与技术栈匹配的轻量验证；TypeScript 项目优先运行 `npx tsc --noEmit`。
   - 如果验证命令失败，停止提交和推送，报告失败命令和关键错误。

5. 提交策略：
   - 如果用户已经暂存了文件，默认只提交已暂存内容。
   - 如果没有暂存内容，但存在工作区改动，可以暂存本次 review 确认为安全且属于同一任务的文件。
   - 不要使用 `git add -A` 盲目加入所有文件；必须避免把无关改动、临时文件、日志、构建产物、密钥或用户未确认的内容纳入提交。
   - 如果改动范围混杂且无法判断哪些应该提交，停止并向用户说明需要拆分或确认。

6. commit message：
   - 如果用户提供了提交信息，优先使用用户提供的信息。
   - 如果用户没有提供，基于 diff 生成简洁英文提交信息，格式优先使用 `feat: ...`、`fix: ...`、`chore: ...`、`docs: ...`、`refactor: ...`。

7. 推送策略：
   - commit 成功后执行 `git push`。
   - 如果当前分支没有 upstream，使用 `git push -u origin <current-branch>`。
   - 如果 push 失败，报告失败原因，不要执行 rebase、force push、reset 或 checkout 等破坏性操作，除非用户明确授权。

## 硬性停止条件

出现以下任一情况时，必须停止，不得 commit 或 push：

- review 发现阻塞问题。
- 修改前后代码逻辑不一致，且没有明确需求依据或兼容处理。
- 明显违反开闭原则并引入核心逻辑回归风险。
- 测试、类型检查、构建或 lint 失败。
- diff 中出现疑似密钥、token、cookie、证书、内部凭据或敏感配置。
- 改动范围明显混杂，无法判断哪些属于本次提交。
- 当前分支、远程仓库或 upstream 状态不明确。
- 需要执行 `git reset --hard`、`git checkout --`、`git clean`、`git push --force` 等破坏性操作。

## 输出要求

如果发现问题，先输出 review findings，按严重程度排序，并明确说明“未提交、未推送”。

如果没有阻塞问题并已提交推送，输出：

- review 结论
- 执行过的验证命令
- commit hash
- push 目标分支
- 非阻塞备注

## 工具使用

优先通过 `bash` 工具执行 git 和验证命令。命令要保持可审计，避免把多个高风险步骤塞进一个复杂命令。
