"""두 학교 급식 배틀 분석과 AG-UI 프로토콜 이벤트 스트림."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any

from ag_ui.core import (
    CustomEvent,
    EventType,
    RunErrorEvent,
    RunFinishedEvent,
    RunStartedEvent,
    StepFinishedEvent,
    StepStartedEvent,
    TextMessageContentEvent,
    TextMessageEndEvent,
    TextMessageStartEvent,
)

from .evaluation import AreaEvaluator, MealFacts
from .rubric import RUBRIC_AREAS
from .workflow import WORKFLOW_PATTERN, EvaluationRequest, evaluate_meal, workflow_graph

MealLoader = Callable[[str, str, str], Awaitable[dict[str, Any]]]


def decide_battle(first: dict[str, Any], second: dict[str, Any]) -> dict[str, Any]:
    if first["total"] > second["total"]:
        outcome, winner, loser = "win", first, second
    elif second["total"] > first["total"]:
        outcome, winner, loser = "win", second, first
    else:
        return {
            "outcome": "tie",
            "winner": None,
            "loser": None,
            "margin": 0.0,
            "summary": (
                f"두 학교 모두 {first['total']:.2f}점으로 동점입니다. "
                f"{first['schoolName']}와 {second['schoolName']}의 총점 차이가 없어 승패를 가릴 수 없습니다."
            ),
        }
    margin = round(winner["total"] - loser["total"], 2)
    return {
        "outcome": outcome,
        "winner": winner["schoolName"],
        "loser": loser["schoolName"],
        "margin": margin,
        "summary": (
            f"{winner['schoolName']}가 {winner['total']:.2f}점으로 "
            f"{loser['schoolName']}({loser['total']:.2f}점)를 {margin:.2f}점 차로 이겼습니다. "
            f"{winner['commentary']}"
        ),
    }


def build_prompt(first_name: str, second_name: str, date: str) -> str:
    areas = ", ".join(f"{area.title} {area.weight}점" for area in RUBRIC_AREAS)
    return (
        f"{date}의 {first_name}와 {second_name} 중식을 비교 분석해 주세요.\n"
        f"평가 영역은 {areas}이며, 각 영역을 5점 척도로 채점한 뒤 가중치를 반영해 100점으로 환산합니다.\n"
        "총점 기준으로 승자와 패자를 가리고, 총평과 영역별 평가 근거를 함께 제시해 주세요.\n"
        "제공된 급식 정보에 없는 사실은 추정하지 말고 확인 불가로 남겨 주세요."
    )


async def analyze_battle(
    evaluator: AreaEvaluator,
    loader: MealLoader,
    schools: list[dict[str, str]],
    date: str,
    prompt: str,
) -> dict[str, Any]:
    results = [await _evaluate_school(evaluator, loader, school, date) for school in schools]
    return {
        "prompt": prompt,
        "date": date,
        "pattern": WORKFLOW_PATTERN,
        "schools": results,
        "battle": decide_battle(results[0], results[1]),
    }


async def _evaluate_school(
    evaluator: AreaEvaluator,
    loader: MealLoader,
    school: dict[str, str],
    date: str,
) -> dict[str, Any]:
    payload = await loader(school["educationOfficeCode"], school["schoolCode"], date)
    items = payload.get("items", [])
    meal = items[0] if items else None
    facts = MealFacts(
        menu=tuple(meal.get("menu", [])) if meal else (),
        origin_info=(meal or {}).get("originInfo"),
        calorie_info=(meal or {}).get("calorieInfo"),
        nutrition_info=(meal or {}).get("nutritionInfo"),
    )
    result = await evaluate_meal(evaluator, EvaluationRequest(school["name"], date, facts))
    result["menu"] = list(facts.menu)
    result["hasMeal"] = bool(facts.menu)
    if not facts.menu:
        result["commentary"] = f"{school['name']}의 {date} 중식 정보가 없어 평가 근거가 없습니다."
    return result


def _sse(event: Any) -> str:
    return f"data: {event.model_dump_json(by_alias=True, exclude_none=True)}\n\n"


async def stream_agui_events(
    evaluator: AreaEvaluator,
    loader: MealLoader,
    schools: list[dict[str, str]],
    date: str,
    prompt: str,
    thread_id: str,
    run_id: str,
) -> AsyncIterator[str]:
    """AG-UI 프로토콜 이벤트를 SSE로 전송한다."""

    yield _sse(RunStartedEvent(type=EventType.RUN_STARTED, thread_id=thread_id, run_id=run_id))
    yield _sse(
        CustomEvent(type=EventType.CUSTOM, name="workflow.graph", value=workflow_graph())
    )
    try:
        results = []
        for school in schools:
            yield _sse(StepStartedEvent(type=EventType.STEP_STARTED, step_name=f"prepare:{school['name']}"))
            result = await _evaluate_school(evaluator, loader, school, date)
            results.append(result)
            for area in result["areas"]:
                yield _sse(
                    CustomEvent(
                        type=EventType.CUSTOM,
                        name="workflow.area",
                        value={"schoolName": result["schoolName"], **area},
                    )
                )
            yield _sse(
                CustomEvent(
                    type=EventType.CUSTOM,
                    name="workflow.school",
                    value=result,
                )
            )
            yield _sse(StepFinishedEvent(type=EventType.STEP_FINISHED, step_name=f"prepare:{school['name']}"))

        battle = decide_battle(results[0], results[1])
        yield _sse(CustomEvent(type=EventType.CUSTOM, name="workflow.battle", value=battle))

        message_id = uuid.uuid4().hex
        yield _sse(
            TextMessageStartEvent(type=EventType.TEXT_MESSAGE_START, message_id=message_id, role="assistant")
        )
        yield _sse(
            TextMessageContentEvent(
                type=EventType.TEXT_MESSAGE_CONTENT, message_id=message_id, delta=battle["summary"]
            )
        )
        yield _sse(TextMessageEndEvent(type=EventType.TEXT_MESSAGE_END, message_id=message_id))
        yield _sse(
            RunFinishedEvent(
                type=EventType.RUN_FINISHED,
                thread_id=thread_id,
                run_id=run_id,
                result={"prompt": prompt, "date": date, "pattern": WORKFLOW_PATTERN, "schools": results, "battle": battle},
            )
        )
    except Exception:  # noqa: BLE001 - 상세 원인은 노출하지 않는다
        yield _sse(
            RunErrorEvent(
                type=EventType.RUN_ERROR,
                message="급식 분석을 완료하지 못했습니다.",
                code="ANALYSIS_FAILED",
            )
        )


__all__ = [
    "analyze_battle",
    "build_prompt",
    "decide_battle",
    "stream_agui_events",
]
