"""Microsoft Agent Framework 기반 급식 평가 워크플로우.

패턴은 concurrent fan-out + sequential fan-in이다.

    prepare -> [4개 영역 평가 에이전트 병렬] -> final-synthesis-agent

`WorkflowBuilder.add_fan_out_edges`로 동일한 급식 정보를 네 영역 에이전트에
동시에 전달하고, `add_fan_in_edges`로 네 결과가 모두 도착한 뒤에만 종합
에이전트를 실행한다. 종합 단계의 가중치 환산은 결정적으로 계산해 루브릭의
100점 환산을 보장한다.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

from agent_framework import Executor, WorkflowBuilder, WorkflowContext, handler

from .evaluation import AreaEvaluator, AreaResult, MealFacts, summarize
from .rubric import RUBRIC_AREAS, RubricArea, interpret

WORKFLOW_PATTERN = "concurrent-fan-out-sequential-fan-in"
_NATURAL_DATE_PATTERN = re.compile(r"(?P<date>\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{8})")


@dataclass
class EvaluationRequest:
    school_name: str
    date: str
    facts: MealFacts


@dataclass
class AreaMessage:
    request: EvaluationRequest
    result: AreaResult


def parse_request(payload: str | dict[str, Any]) -> EvaluationRequest:
    """DevUI 등 문자열/딕셔너리 입력을 받는 호출자를 위해 요청 객체로 바꾼다.

    DevUI의 입력란은 JSON뿐 아니라 자연어도 전달할 수 있다. 자연어에는
    메뉴 원문이 없으므로 학교·날짜를 식별하고, 빈 근거로 평가한 결과에는
    평가 영역별 미확인 정보가 포함된다.
    """

    if isinstance(payload, str):
        try:
            data = json.loads(payload)
        except json.JSONDecodeError as error:
            match = _NATURAL_DATE_PATTERN.search(payload)
            if not match:
                raise ValueError("자연어 입력에 YYYY-MM-DD 형식의 날짜가 필요합니다.") from error
            raw_date = match.group("date")
            normalized_date = re.sub(r"[-./]", "", raw_date)
            school_name = payload[: match.start()].strip()
            school_name = re.split(r"\s*(?:와|과)\s*", school_name, maxsplit=1)[0].strip()
            if not school_name:
                school_name = "자연어 입력 학교"
            return EvaluationRequest(
                school_name=school_name,
                date=normalized_date,
                facts=MealFacts(menu=(), origin_info=None, calorie_info=None, nutrition_info=None),
            )
    else:
        data = payload
    if not isinstance(data, dict):
        raise ValueError("입력은 JSON 객체여야 합니다.")
    facts = data.get("facts") or {}
    if not isinstance(facts, dict):
        raise ValueError("facts는 JSON 객체여야 합니다.")
    menu = facts.get("menu") or []
    if not isinstance(menu, list):
        raise ValueError("facts.menu는 배열이어야 합니다.")
    return EvaluationRequest(
        school_name=str(data.get("schoolName") or data.get("school_name") or "이름 미상 학교"),
        date=str(data.get("date") or ""),
        facts=MealFacts(
            menu=tuple(str(item) for item in menu),
            origin_info=facts.get("originInfo") or facts.get("origin_info"),
            calorie_info=facts.get("calorieInfo") or facts.get("calorie_info"),
            nutrition_info=facts.get("nutritionInfo") or facts.get("nutrition_info"),
        ),
    )


class PrepareExecutor(Executor):
    """식별 정보를 분리하고 평가 근거만 네 영역으로 fan-out 한다."""

    def __init__(self) -> None:
        super().__init__(id="prepare-meal-facts")

    @handler
    async def run(self, request: EvaluationRequest, ctx: WorkflowContext[EvaluationRequest]) -> None:
        await ctx.send_message(request)

    @handler
    async def run_from_text(self, payload: str, ctx: WorkflowContext[EvaluationRequest]) -> None:
        await ctx.send_message(parse_request(payload))

    @handler
    async def run_from_mapping(self, payload: dict, ctx: WorkflowContext[EvaluationRequest]) -> None:
        await ctx.send_message(parse_request(payload))


class AreaExecutor(Executor):
    def __init__(self, area: RubricArea, evaluator: AreaEvaluator) -> None:
        super().__init__(id=area.agent_name)
        self._area = area
        self._evaluator = evaluator

    @handler
    async def run(self, request: EvaluationRequest, ctx: WorkflowContext[AreaMessage]) -> None:
        result = await self._evaluator.evaluate(self._area, request.facts)
        await ctx.send_message(AreaMessage(request=request, result=result))


class SynthesisExecutor(Executor):
    """네 영역 결과가 모두 모인 뒤에만 총점과 총평을 만든다."""

    def __init__(self) -> None:
        super().__init__(id="final-synthesis-agent")

    @handler
    async def run(self, messages: list[AreaMessage], ctx: WorkflowContext[Any, dict[str, Any]]) -> None:
        request = messages[0].request
        summary = summarize([message.result for message in messages])
        strongest = max(summary["areas"], key=lambda item: item.score)
        weakest = min(summary["areas"], key=lambda item: item.score)
        highlight = (
            f"가장 강한 영역은 {strongest.area_title}({strongest.score}/5)이고, "
            f"가장 약한 영역은 {weakest.area_title}({weakest.score}/5)입니다."
            if strongest.area_id != weakest.area_id
            else f"네 영역이 모두 {strongest.score}/5로 동일합니다."
        )
        commentary = (
            f"{request.school_name} {request.date} 중식의 총점은 {summary['total']:.2f}점"
            f"({interpret(summary['total'])})입니다. {highlight}"
        )
        await ctx.yield_output(
            {
                "schoolName": request.school_name,
                "date": request.date,
                "total": summary["total"],
                "interpretation": interpret(summary["total"]),
                "commentary": commentary,
                "areas": [result.to_dict() for result in summary["areas"]],
                "unknowns": summary["unknowns"],
                "warnings": summary["warnings"],
            }
        )


def build_workflow(evaluator: AreaEvaluator):
    prepare = PrepareExecutor()
    areas = [AreaExecutor(area, evaluator) for area in RUBRIC_AREAS]
    synthesis = SynthesisExecutor()
    return (
        WorkflowBuilder(start_executor=prepare, name="school-lunch-evaluation")
        .add_fan_out_edges(prepare, areas)
        .add_fan_in_edges(areas, synthesis)
        .build()
    )


def workflow_graph() -> dict[str, Any]:
    """분석 화면 시각화에서 사용할 워크플로우 그래프 설명."""

    nodes = [{"id": "prepare-meal-facts", "label": "급식 정보 정규화", "kind": "prepare", "stage": 0}]
    nodes += [
        {
            "id": area.agent_name,
            "label": f"{area.title} ({area.weight}점)",
            "kind": "area",
            "stage": 1,
            "areaId": area.id,
            "weight": area.weight,
        }
        for area in RUBRIC_AREAS
    ]
    nodes.append({"id": "final-synthesis-agent", "label": "최종 종합 (100점 환산)", "kind": "synthesis", "stage": 2})
    edges = [{"from": "prepare-meal-facts", "to": area.agent_name, "kind": "fan-out"} for area in RUBRIC_AREAS]
    edges += [{"from": area.agent_name, "to": "final-synthesis-agent", "kind": "fan-in"} for area in RUBRIC_AREAS]
    return {"pattern": WORKFLOW_PATTERN, "nodes": nodes, "edges": edges}


async def evaluate_meal(evaluator: AreaEvaluator, request: EvaluationRequest) -> dict[str, Any]:
    workflow = build_workflow(evaluator)
    result = await workflow.run(request)
    outputs = result.get_outputs()
    if not outputs:
        raise RuntimeError("workflow produced no output")
    return outputs[0]
