from __future__ import annotations

import re

TITLE_MARKERS = ("文案标题", "标题", "字体", "字形", "字效")
TITLE_STYLE_MARKERS = ("Q版", "卡通", "圆润", "可爱", "儿童", "泡泡", "手写", "贴纸")
COLOR_MARKERS = ("色彩", "颜色", "配色", "色调")
LIMIT_MARKERS = ("限制", "要求", "禁止", "不要", "不能", "不得", "必须", "只生成", "避免")


def extract_prompt_constraints(prompt: str) -> list[str]:
    text = _clean_text(prompt)
    if not text:
        return []
    constraints: list[str] = []
    for clause in _prompt_clauses(text):
        if _is_title_font_constraint(clause):
            constraints.append(f"标题字体/标题设计：{clause}")
        audience = _target_audience(clause)
        if audience:
            constraints.append(f"目标人群：{audience}")
        color = _color_constraint(clause)
        if color:
            constraints.append(f"色彩：{color}")
    limit = _limit_constraint(text)
    if limit:
        constraints.append(limit)
    return _dedupe(constraints)


def build_prompt_guard_instructions(constraints: list[str]) -> str:
    clean_constraints = [item.strip() for item in constraints if item.strip()]
    lines = [
        "提示词保真规则：",
        "你只能扩写用户提示词，不得改变原意，不得删除、弱化或转移用户的硬性约束。",
        "如果硬性约束之间有冲突，优先保留用户明确指定的对象、文字、字体、颜色、构图和限制项。",
    ]
    if clean_constraints:
        lines.append("硬性约束：")
        lines.extend(f"- {item}" for item in clean_constraints)
    return "\n".join(lines)


def build_original_prompt_instructions() -> str:
    return "\n".join(
        [
            "原始提示词模式：",
            "不得优化、扩写、翻译、总结、重排或改写用户提示词。",
            "调用图像生成工具时，必须逐字使用用户原始提示词；不要自行添加风格、构图、受众、文字或限制条件。",
        ]
    )


def build_guarded_prompt(prompt: str, instructions: str) -> str:
    clean_prompt = str(prompt or "").strip()
    clean_instructions = str(instructions or "").strip()
    if not clean_instructions:
        return clean_prompt
    return f"{clean_instructions}\n\n用户原始提示词：\n{clean_prompt}"


def _clean_text(prompt: str) -> str:
    return re.sub(r"\s+", " ", str(prompt or "").replace("\r", "\n")).strip()


def _prompt_clauses(text: str) -> list[str]:
    parts = re.split(r"[，。；;、\n]+", text)
    return [part.strip(" ：:") for part in parts if part.strip(" ：:")]


def _is_title_font_constraint(clause: str) -> bool:
    return any(marker in clause for marker in TITLE_MARKERS) and any(marker in clause for marker in TITLE_STYLE_MARKERS)


def _target_audience(clause: str) -> str:
    match = re.search(r"(?:产品)?目标人群(?:是|为|:|：)?(.+)", clause)
    if not match:
        return ""
    return match.group(1).strip(" ：:")


def _color_constraint(clause: str) -> str:
    for marker in COLOR_MARKERS:
        if marker in clause:
            value = clause.split(marker, 1)[1].strip(" ：:")
            return value or clause
    return ""


def _limit_constraint(text: str) -> str:
    match = re.search(r"(限制|要求|禁止|避免)(?:：|:)(.+)", text)
    if match:
        value = match.group(2).strip()
        if value:
            return f"{match.group(1)}：{value}"
    negative_clauses = [clause for clause in _prompt_clauses(text) if any(clause.startswith(marker) for marker in LIMIT_MARKERS)]
    if negative_clauses:
        return "限制：" + "，".join(negative_clauses)
    return ""


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result
