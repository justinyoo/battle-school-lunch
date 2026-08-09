"""급식 한 끼 평가 로직.

각 평가 영역은 독립된 평가자가 담당한다. Microsoft Foundry 설정이 있으면
Microsoft Agent Framework의 `Agent`가 영역을 채점하고, 설정이 없으면
동일한 인터페이스의 결정적 평가자가 같은 근거 규칙으로 채점한다.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Protocol

from .rubric import RUBRIC_AREAS, RubricArea, clamp_score

_FRIED_KEYWORDS = ("튀김", "까스", "너겟", "핫도그", "프라이", "치킨")
_PROCESSED_KEYWORDS = ("소시지", "햄", "어묵", "만두", "베이컨", "맛살")
_VEGETABLE_KEYWORDS = ("나물", "샐러드", "채", "무침", "쌈", "김치", "버섯", "브로콜리", "시금치")
_FRUIT_KEYWORDS = ("사과", "배", "귤", "포도", "바나나", "방울토마토", "수박", "과일", "딸기")
_PROTEIN_KEYWORDS = ("돼지", "소고기", "쇠고기", "닭", "생선", "고등어", "두부", "계란", "달걀", "콩", "오징어", "새우")
_SOUP_KEYWORDS = ("국", "탕", "찌개")
_RICE_KEYWORDS = ("밥", "면", "국수", "빵")
_DESSERT_KEYWORDS = ("케익", "케이크", "요구르트", "주스", "우유", "푸딩", "젤리")
_DOMESTIC_KEYWORDS = ("국내산", "한우", "국산")
_ALLERGEN_PATTERN = re.compile(r"\(([\d.\s]+)\)")


@dataclass(frozen=True)
class MealFacts:
    """평가 근거로 사용할 수 있는 급식 정보만 담는다."""

    menu: tuple[str, ...]
    origin_info: str | None
    calorie_info: str | None
    nutrition_info: str | None

    @property
    def calories(self) -> float | None:
        if not self.calorie_info:
            return None
        found = re.search(r"[\d.]+", self.calorie_info)
        return float(found.group()) if found else None

    @property
    def nutrients(self) -> dict[str, float]:
        if not self.nutrition_info:
            return {}
        text = re.sub(r"<br\s*/?>", "\n", self.nutrition_info, flags=re.IGNORECASE)
        values: dict[str, float] = {}
        for line in text.splitlines():
            parts = line.split(":")
            if len(parts) != 2:
                continue
            found = re.search(r"[\d.]+", parts[1])
            if found:
                values[parts[0].strip()] = float(found.group())
        return values

    @property
    def has_allergen_labels(self) -> bool:
        return any(_ALLERGEN_PATTERN.search(item) for item in self.menu)

    def count(self, keywords: tuple[str, ...]) -> int:
        return sum(1 for item in self.menu if any(word in item for word in keywords))

    def as_prompt_context(self) -> str:
        return json.dumps(
            {
                "menu": list(self.menu),
                "originInfo": self.origin_info,
                "calorieInfo": self.calorie_info,
                "nutritionInfo": self.nutrition_info,
            },
            ensure_ascii=False,
            indent=2,
        )


@dataclass
class AreaResult:
    area_id: str
    area_title: str
    agent_name: str
    weight: int
    score: int
    weighted_score: float
    rationale: str = ""
    evidence: list[str] = field(default_factory=list)
    unknowns: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    mode: str = "deterministic"

    def to_dict(self) -> dict[str, Any]:
        return {
            "areaId": self.area_id,
            "areaTitle": self.area_title,
            "title": self.area_title,
            "agentName": self.agent_name,
            "weight": self.weight,
            "score": self.score,
            "weightedScore": self.weighted_score,
            "rationale": self.rationale,
            "evidence": self.evidence,
            "unknowns": self.unknowns,
            "warnings": self.warnings,
            "mode": self.mode,
        }


class AreaEvaluator(Protocol):
    async def evaluate(self, area: RubricArea, facts: MealFacts) -> AreaResult: ...


def _finalize(
    area: RubricArea,
    score: int,
    evidence: list[str],
    unknowns: list[str],
    warnings: list[str],
    *,
    rationale: str = "",
    mode: str = "deterministic",
) -> AreaResult:
    bounded = clamp_score(score)
    reasons = evidence or ["제공된 급식 정보만으로 판단했습니다."]
    return AreaResult(
        area_id=area.id,
        area_title=area.title,
        agent_name=area.agent_name,
        weight=area.weight,
        score=bounded,
        weighted_score=area.weighted_score(bounded),
        rationale=rationale or " ".join(reasons),
        evidence=reasons,
        unknowns=unknowns,
        warnings=warnings,
        mode=mode,
    )


def _evaluate_nutrition(facts: MealFacts) -> tuple[int, list[str], list[str], list[str]]:
    evidence, unknowns, warnings = [], [], []
    score = 2
    nutrients = facts.nutrients
    calories = facts.calories

    if calories is None:
        unknowns.append("열량 정보가 제공되지 않았습니다.")
    else:
        evidence.append(f"제공 열량은 {calories:g} Kcal입니다.")
        if 600 <= calories <= 850:
            score += 1
            evidence.append("1회 제공 열량이 권장 범위에 있습니다.")
        elif calories > 1000:
            score -= 1
            warnings.append("1회 제공 열량이 높습니다.")

    if not nutrients:
        unknowns.append("영양소 정보가 제공되지 않았습니다.")
    else:
        protein = nutrients.get("단백질(g)")
        if protein is None:
            unknowns.append("단백질 정보가 제공되지 않았습니다.")
        else:
            evidence.append(f"단백질은 {protein:g} g입니다.")
            if protein >= 18:
                score += 1
        sodium = nutrients.get("나트륨(mg)")
        if sodium is None:
            unknowns.append("나트륨 정보가 제공되지 않았습니다.")
        else:
            evidence.append(f"나트륨은 {sodium:g} mg입니다.")
            if sodium <= 900:
                score += 1
            elif sodium > 1300:
                score -= 1
                warnings.append("나트륨 함량이 높습니다.")

    vegetables = facts.count(_VEGETABLE_KEYWORDS)
    proteins = facts.count(_PROTEIN_KEYWORDS)
    evidence.append(f"채소·김치류 {vegetables}개, 단백질 반찬 {proteins}개가 확인됩니다.")
    if vegetables >= 2 and proteins >= 1:
        score += 1
    elif vegetables == 0:
        score -= 1
        warnings.append("채소 반찬이 확인되지 않습니다.")

    fried = facts.count(_FRIED_KEYWORDS)
    if fried >= 2:
        score -= 1
        warnings.append("튀김류 메뉴가 반복됩니다.")
    return score, evidence, unknowns, warnings


def _evaluate_ingredient_safety(facts: MealFacts) -> tuple[int, list[str], list[str], list[str]]:
    evidence, unknowns, warnings = [], [], []
    score = 1

    if facts.origin_info:
        score += 1
        evidence.append("원산지 정보가 제공되어 식재료 출처를 확인할 수 있습니다.")
        if any(word in facts.origin_info for word in _DOMESTIC_KEYWORDS):
            score += 1
            evidence.append("국내산 표기가 확인됩니다.")
    else:
        unknowns.append("원산지 정보가 제공되지 않았습니다.")

    if facts.has_allergen_labels:
        score += 1
        evidence.append("메뉴에 알레르기 유발 식품 표시가 병기되어 있습니다.")
    else:
        unknowns.append("알레르기 표시가 확인되지 않습니다. 알레르겐이 없다는 뜻은 아닙니다.")

    processed = facts.count(_PROCESSED_KEYWORDS)
    if processed >= 2:
        score -= 1
        warnings.append("가공식품 기반 메뉴가 여러 개 확인됩니다.")
    elif processed == 0 and facts.menu:
        score += 1
        evidence.append("가공식품 위주의 메뉴가 확인되지 않습니다.")
    unknowns.append("위생·조리 관리 자료는 급식 정보에 포함되지 않아 확인 불가입니다.")
    return score, evidence, unknowns, warnings


def _evaluate_menu_variety(facts: MealFacts) -> tuple[int, list[str], list[str], list[str]]:
    evidence, unknowns, warnings = [], [], []
    score = 1

    groups = {
        "주식": facts.count(_RICE_KEYWORDS),
        "국·탕": facts.count(_SOUP_KEYWORDS),
        "단백질 반찬": facts.count(_PROTEIN_KEYWORDS),
        "채소 반찬": facts.count(_VEGETABLE_KEYWORDS),
        "후식": facts.count(_DESSERT_KEYWORDS) + facts.count(_FRUIT_KEYWORDS),
    }
    present = [name for name, count in groups.items() if count > 0]
    evidence.append(f"구성 요소: {', '.join(present) if present else '분류 가능한 구성이 없습니다'}.")
    score += min(3, max(0, len(present) - 1))

    if len(facts.menu) >= 5:
        score += 1
        evidence.append(f"메뉴 수는 {len(facts.menu)}개로 구성이 다양합니다.")
    elif len(facts.menu) <= 2:
        score -= 1
        warnings.append("메뉴 수가 적어 단조로울 수 있습니다.")

    unknowns.append("학생 설문, 섭취율, 잔반량 자료가 없어 실제 기호도는 확인 불가이며 예상 기호도로만 판단했습니다.")
    return score, evidence, unknowns, warnings


def _evaluate_sustainability(facts: MealFacts) -> tuple[int, list[str], list[str], list[str]]:
    evidence, unknowns, warnings = [], [], []
    score = 2

    if facts.origin_info and any(word in facts.origin_info for word in _DOMESTIC_KEYWORDS):
        score += 1
        evidence.append("국내산 식재료 표기가 있어 지역성 측면에서 긍정적입니다.")
    else:
        unknowns.append("지역·제철 식재료를 판단할 원산지 근거가 부족합니다.")

    meat = facts.count(("돼지", "소고기", "쇠고기", "닭", "베이컨", "햄"))
    plant = facts.count(("두부", "콩", "나물", "채", "버섯"))
    evidence.append(f"육류 기반 메뉴 {meat}개, 식물성 단백질·채소 메뉴 {plant}개입니다.")
    if meat >= 3 and plant == 0:
        score -= 1
        warnings.append("단백질원이 육류에 편중되어 있습니다.")
    elif plant >= 2:
        score += 1

    unknowns.append("급식비, 조달 방식, 잔반량, 포장재 자료가 제공되지 않아 가격 가치와 폐기물 관리는 확인 불가입니다.")
    return score, evidence, unknowns, warnings


_DETERMINISTIC_RULES = {
    "nutrition-health": _evaluate_nutrition,
    "ingredient-safety": _evaluate_ingredient_safety,
    "menu-variety-preference": _evaluate_menu_variety,
    "sustainability-value": _evaluate_sustainability,
}


class DeterministicAreaEvaluator:
    """모델 자격 증명 없이도 동일한 계약으로 동작하는 오프라인 평가자."""

    mode = "deterministic"

    async def evaluate(self, area: RubricArea, facts: MealFacts) -> AreaResult:
        if not facts.menu:
            return _finalize(area, 1, [], ["메뉴 정보가 없어 평가 근거가 없습니다."], [])
        score, evidence, unknowns, warnings = _DETERMINISTIC_RULES[area.id](facts)
        return _finalize(area, score, evidence, unknowns, warnings)


AREA_SYSTEM_PROMPT = """당신은 학교 급식 평가 에이전트 `{agent_name}`입니다.
담당 영역은 "{title}"이며 이 영역만 채점합니다.

평가 목적: {purpose}

주요 확인 항목:
{checkpoints}

5점 척도:
{scale}

주의: {caution}

규칙:
- 주어진 급식 정보에 없는 사실을 추정하지 않습니다.
- 정보가 없으면 unknowns에 `확인 불가` 사유로 기록합니다.
- 다른 평가 영역은 채점하지 않습니다.
- 아래 JSON 형식으로만 응답합니다.

{{"score": 1~5 정수, "evidence": ["근거"], "unknowns": ["확인 불가 항목"], "warnings": ["안전 우려"]}}
"""


def build_area_instructions(area: RubricArea) -> str:
    return AREA_SYSTEM_PROMPT.format(
        agent_name=area.agent_name,
        title=area.title,
        purpose=area.purpose,
        checkpoints="\n".join(f"- {item}" for item in area.checkpoints),
        scale="\n".join(f"{index + 1}점: {item}" for index, item in enumerate(area.scale)),
        caution=area.caution,
    )


def parse_area_payload(area: RubricArea, text: str) -> AreaResult:
    found = re.search(r"\{.*\}", text, re.DOTALL)
    if not found:
        raise ValueError("agent response is not JSON")
    payload = json.loads(found.group())
    if not isinstance(payload, dict) or not isinstance(payload.get("score"), (int, float)):
        raise ValueError("agent response has no score")

    def strings(key: str) -> list[str]:
        value = payload.get(key)
        return [str(item) for item in value if str(item).strip()] if isinstance(value, list) else []

    return _finalize(
        area,
        int(payload["score"]),
        strings("evidence"),
        strings("unknowns"),
        strings("warnings"),
        rationale=str(payload.get("rationale", "")).strip(),
        mode="foundry",
    )


class ModelAreaEvaluator:
    """Microsoft Agent Framework `Agent`로 한 영역을 채점한다."""

    mode = "foundry"

    def __init__(self, agent_factory: Any) -> None:
        self._agent_factory = agent_factory
        self._fallback = DeterministicAreaEvaluator()

    async def evaluate(self, area: RubricArea, facts: MealFacts) -> AreaResult:
        agent = self._agent_factory(area)
        response = await agent.run(f"다음 급식 한 끼를 평가하세요.\n\n{facts.as_prompt_context()}")
        return parse_area_payload(area, response.text)


def summarize(results: list[AreaResult]) -> dict[str, Any]:
    """네 영역 결과를 결정적으로 합산한다."""

    by_id = {result.area_id: result for result in results}
    ordered = [by_id[area.id] for area in RUBRIC_AREAS if area.id in by_id]
    total = round(sum(result.weighted_score for result in ordered), 2)
    unknowns = [item for result in ordered for item in result.unknowns]
    warnings = [item for result in ordered for item in result.warnings]
    return {"areas": ordered, "total": total, "unknowns": unknowns, "warnings": warnings}
