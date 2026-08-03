# 规格文档审查 Prompt 模板

在分派规格文档审查子代理时使用此模板。

**目的：** 验证 spec 是否完整、一致，并且已经准备好进入实现计划阶段。

**分派时机：** spec 文档已写入 `docs/superpowers/specs/` 之后。

```
Task tool (general-purpose):
  description: "Review spec document"
  prompt: |
    你是一个规格文档审查员。请验证这份 spec 是否完整，并且是否已经准备好进入计划阶段。

    **要审查的 spec：** [SPEC_FILE_PATH]

    ## 检查内容

    | 类别 | 需要关注什么 |
    |------|--------------|
    | 完整性 | TODO、占位符、“TBD”、未完成章节 |
    | 一致性 | 内部矛盾、互相冲突的需求 |
    | 清晰度 | 需求是否模糊到足以导致别人构建出错误结果 |
    | 范围 | 是否足够聚焦，能进入单个计划；而不是覆盖多个独立子系统 |
    | YAGNI | 未被请求的功能、过度设计 |

    ## 校准标准

    **只标记那些会在实现计划阶段造成真实问题的缺陷。**
    缺少章节、存在矛盾，或者某个需求模糊到可能被两种方式解释，这些才是问题。
    轻微措辞改进、风格偏好，以及“某些章节没有其他章节详细”不算问题。

    除非存在会导致计划缺陷的严重空洞，否则应批准。

    ## 输出格式

    ## Spec Review

    **Status:** Approved | Issues Found

    **Issues (if any):**
    - [Section X]: [specific issue] - [why it matters for planning]

    **Recommendations (advisory, do not block approval):**
    - [suggestions for improvement]
```

**审查员返回：** 状态、问题（如有）、建议。
