"""급식 평가 루브릭 정의.

`EVALUATION_RUBRIC.md`의 4개 평가 영역, 5점 척도, 가중치를 코드로 옮긴
단일 진실 공급원이다. 가중치 합은 100점이며, 영역 환산 점수는
`획득 점수 / 5 * 가중치`로 계산한다.
"""

from __future__ import annotations

from dataclasses import dataclass

SCORE_MIN = 1
SCORE_MAX = 5


@dataclass(frozen=True)
class RubricArea:
    id: str
    agent_name: str
    title: str
    weight: int
    purpose: str
    checkpoints: tuple[str, ...]
    scale: tuple[str, ...]
    caution: str

    def weighted_score(self, score: int) -> float:
        return round(clamp_score(score) / SCORE_MAX * self.weight, 2)


RUBRIC_AREAS: tuple[RubricArea, ...] = (
    RubricArea(
        id="nutrition-health",
        agent_name="nutrition-health-agent",
        title="영양·건강성",
        weight=35,
        purpose="주어진 제공량을 고려할 때 이 끼니가 영양적으로 균형 잡혀 있고 건강 위험 요소를 적절히 관리하는지 평가한다.",
        checkpoints=(
            "탄수화물·단백질·지방의 균형",
            "곡류, 채소, 과일, 콩류, 달걀·생선·살코기 등 식품군 구성",
            "적정 총열량과 1회 제공량",
            "단백질원의 질과 다양성",
            "칼슘, 철분, 비타민 A·C, 식이섬유 등 미량영양소",
            "나트륨, 당류, 포화지방 및 튀김·가공식품의 빈도",
        ),
        scale=(
            "영양 불균형이 크고 고열량·고나트륨·고당류 또는 포화지방 식단이다.",
            "기본 식품군이나 일부 영양소가 부족하고 건강 위험 요소가 여러 개 나타난다.",
            "기본 영양 기준을 대체로 충족하지만 일부 영양소 또는 건강 위험 요소에 개선 여지가 있다.",
            "식품군과 주요 영양소의 균형이 좋고 나트륨·당류·포화지방 및 튀김·가공식품이 대체로 적절하다.",
            "권장 영양량과 식품군 구성이 매우 우수하고 건강 위험 요소가 효과적으로 관리된다.",
        ),
        caution="제공되지 않은 영양소 값을 추정하지 않는다. 없는 항목은 확인 불가로 남긴다.",
    ),
    RubricArea(
        id="ingredient-safety",
        agent_name="ingredient-safety-agent",
        title="식재료 품질·안전성",
        weight=25,
        purpose="사용된 식재료의 신선도·품질과 원산지·알레르기·위생 정보의 신뢰성을 평가한다.",
        checkpoints=(
            "신선 식재료와 과도한 가공식품 사용 여부",
            "원산지 정보의 명확성",
            "국내산·친환경·제철·지역 식재료 사용 여부",
            "식재료 품질과 조리 신뢰성을 뒷받침하는 공개 정보",
            "알레르기 유발 식품 표시의 명확성",
            "위생·안전 관리 정보의 존재와 일관성",
        ),
        scale=(
            "식재료·원산지 정보가 매우 부족하거나 안전·알레르기 관리가 확인되지 않는다.",
            "일부 정보는 있으나 품질 또는 원산지·알레르기·위생 정보의 공백이 반복된다.",
            "일반적인 품질·안전 수준이며 핵심 정보가 대체로 제공된다.",
            "신선하고 안전한 식재료를 주로 사용하며 원산지와 알레르기 정보가 비교적 명확하다.",
            "신선도, 원산지, 친환경·제철성, 알레르기 표시와 안전 관리가 모두 뛰어나고 근거가 일관된다.",
        ),
        caution="메뉴명만으로 신선도, 친환경성, 국내산 여부 또는 위생 수준을 추정하지 않는다.",
    ),
    RubricArea(
        id="menu-variety-preference",
        agent_name="menu-variety-preference-agent",
        title="메뉴 다양성·기호도",
        weight=25,
        purpose="메뉴가 여러 식품군·조리법·색상·식감을 제공하고 학생들이 실제로 먹기 쉬운 구성인지 평가한다.",
        checkpoints=(
            "메뉴와 식재료의 반복 정도",
            "조리법, 색상, 식감 및 식품군의 다양성",
            "밥·국·반찬·후식의 조화",
            "메뉴 간 맛과 구성의 충돌 또는 중복 가능성",
            "학생 설문, 실제 섭취율, 잔반량",
            "다양한 학생이 선택·섭취하기 어려운 구성인지 여부",
        ),
        scale=(
            "메뉴가 매우 단조롭고 반복이 많으며 잔반이 많을 가능성이 크다.",
            "반복 또는 구성 불균형이 자주 나타나고 학생 기호도가 낮다는 근거가 있다.",
            "메뉴 구성과 기호도가 보통 수준이며 뚜렷한 장단점이 함께 있다.",
            "조리법·색상·식감이 다양하고 메뉴 조화와 기호도가 높다.",
            "메뉴 조화가 뛰어나고 다양한 학생이 실제로 잘 먹으며 잔반이 적다는 근거가 있다.",
        ),
        caution="설문·잔반량이 없으면 실제 기호도를 단정하지 않고 예상 기호도로 구분한다.",
    ),
    RubricArea(
        id="sustainability-value",
        agent_name="sustainability-value-agent",
        title="지속가능성·가격 가치",
        weight=15,
        purpose="급식비와 제공 품질의 균형, 지역·제철 식재료 활용 및 환경 부담 저감 노력을 함께 평가한다.",
        checkpoints=(
            "급식비 또는 1식 단가 대비 영양·품질",
            "지역·제철 식재료 사용",
            "육류 편중 정도와 단백질원 구성",
            "음식물 쓰레기·잔반 저감 노력",
            "포장재 및 일회용품 발생량",
            "지속가능한 조달·운영에 관한 공개 근거",
        ),
        scale=(
            "비용 대비 품질이 낮고 지역성·환경성·잔반 관리 노력이 거의 확인되지 않는다.",
            "비용 또는 환경 측면의 개선 필요성이 크고 관련 근거가 제한적이다.",
            "평균적인 가격과 운영 수준이며 일부 지속가능성 요소가 확인된다.",
            "가격 대비 품질이 양호하고 지역·제철 식재료 또는 잔반 저감 노력이 있다.",
            "비용 효율, 지역·제철성, 환경성, 음식물 쓰레기·포장재 관리가 모두 우수하다.",
        ),
        caution="급식비, 조달 방식, 폐기물 자료가 없으면 확인 불가로 기록한다.",
    ),
)

TOTAL_WEIGHT = sum(area.weight for area in RUBRIC_AREAS)
AREAS_BY_ID = {area.id: area for area in RUBRIC_AREAS}


def clamp_score(score: int) -> int:
    return max(SCORE_MIN, min(SCORE_MAX, int(score)))


def total_score(scores: dict[str, int]) -> float:
    return round(sum(area.weighted_score(scores.get(area.id, SCORE_MIN)) for area in RUBRIC_AREAS), 2)


def interpret(total: float) -> str:
    if total >= 90:
        return "매우 우수"
    if total >= 80:
        return "우수"
    if total >= 70:
        return "보통"
    if total >= 60:
        return "개선 필요"
    return "미흡"
