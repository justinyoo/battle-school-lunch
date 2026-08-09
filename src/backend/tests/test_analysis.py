"""루브릭, 워크플로우, 분석 API 테스트."""

from __future__ import annotations

import asyncio
import json
from datetime import date, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import analysis
from app import main
from app.evaluation import DeterministicAreaEvaluator, MealFacts, parse_area_payload
from app.main import app
from app.rubric import AREAS_BY_ID, RUBRIC_AREAS, TOTAL_WEIGHT, interpret, total_score
from app.workflow import WORKFLOW_PATTERN, EvaluationRequest, build_workflow, evaluate_meal, parse_request, workflow_graph

RICH_MENU = ("기장밥", "돈까스", "미역국", "배추김치", "방울토마토", "시금치나물")
POOR_MENU = ("백미밥", "치킨너겟", "라면", "단무지", "콜라")


def _facts(menu: tuple[str, ...]) -> MealFacts:
    return MealFacts(
        menu=menu,
        origin_info="쌀:국내산",
        calorie_info="780 Kcal",
        nutrition_info="탄수화물(g) : 110.0\n단백질(g) : 25.0\n나트륨(mg) : 820.0",
    )


def _valid_date() -> str:
    return date.today().strftime("%Y%m%d")


def test_rubric_weights_sum_to_hundred() -> None:
    assert sum(area.weight for area in RUBRIC_AREAS) == TOTAL_WEIGHT == 100
    assert len(AREAS_BY_ID) == len(RUBRIC_AREAS) == 4


@pytest.mark.parametrize("score,expected", [(5, 35.0), (4, 28.0), (3, 21.0), (1, 7.0)])
def test_weighted_score_conversion(score: int, expected: float) -> None:
    assert AREAS_BY_ID["nutrition-health"].weighted_score(score) == expected


def test_total_score_and_interpretation() -> None:
    perfect = {area.id: 5 for area in RUBRIC_AREAS}
    assert total_score(perfect) == 100.0
    assert interpret(100.0) == "매우 우수"
    assert interpret(45.0) == "미흡"


def test_parse_area_payload_clamps_and_defaults() -> None:
    area = AREAS_BY_ID["nutrition-health"]
    parsed = parse_area_payload(area, '설명 {"score": 9, "rationale": "충분", "evidence": ["근거"]}')
    assert parsed.score == 5 and parsed.rationale == "충분" and parsed.evidence == ["근거"]
    assert parsed.weighted_score == area.weighted_score(5)
    with pytest.raises(ValueError):
        parse_area_payload(area, "JSON 아님")


def test_deterministic_evaluator_differentiates_menus() -> None:
    evaluator = DeterministicAreaEvaluator()
    rich = asyncio.run(evaluate_meal(evaluator, EvaluationRequest("A", "20260807", _facts(RICH_MENU))))
    poor = asyncio.run(evaluate_meal(evaluator, EvaluationRequest("B", "20260807", _facts(POOR_MENU))))
    assert rich["total"] > poor["total"]
    assert 0 < rich["total"] <= 100
    assert all(1 <= area["score"] <= 5 for area in rich["areas"])


def test_workflow_fans_out_to_every_area_and_fans_in() -> None:
    result = asyncio.run(
        evaluate_meal(DeterministicAreaEvaluator(), EvaluationRequest("A", "20260807", _facts(RICH_MENU)))
    )
    assert [area["areaId"] for area in result["areas"]] == [area.id for area in RUBRIC_AREAS]
    assert result["total"] == pytest.approx(sum(area["weightedScore"] for area in result["areas"]))
    assert result["commentary"]


def test_workflow_graph_describes_fan_out_fan_in() -> None:
    graph = workflow_graph()
    assert graph["pattern"] == WORKFLOW_PATTERN
    stages = {node["id"]: node["stage"] for node in graph["nodes"]}
    assert stages["prepare-meal-facts"] == 0
    assert stages["final-synthesis-agent"] == 2
    assert sum(1 for stage in stages.values() if stage == 1) == len(RUBRIC_AREAS)
    assert len(graph["edges"]) == len(RUBRIC_AREAS) * 2


def test_decide_battle_reports_winner_and_tie() -> None:
    first = {"schoolName": "A", "total": 80.0, "commentary": "총평 A"}
    second = {"schoolName": "B", "total": 60.0, "commentary": "총평 B"}
    win = analysis.decide_battle(first, second)
    assert win["outcome"] == "win" and win["winner"] == "A" and win["loser"] == "B" and win["margin"] == 20.0
    tie = analysis.decide_battle(first, {**second, "total": 80.0})
    assert tie["outcome"] == "tie" and tie["winner"] is None and tie["margin"] == 0.0


async def _loader(_office: str, code: str, target: str) -> dict[str, Any]:
    menu = RICH_MENU if code == "1234567" else POOR_MENU
    return {
        "items": [
            {
                "date": target,
                "menu": list(menu),
                "originInfo": "쌀:국내산",
                "calorieInfo": "780 Kcal",
                "nutritionInfo": "단백질(g) : 25.0\n나트륨(mg) : 820.0",
            }
        ]
    }


def _schools() -> list[dict[str, str]]:
    return [
        {"educationOfficeCode": "B10", "schoolCode": "1234567", "name": "서울고등학교"},
        {"educationOfficeCode": "B10", "schoolCode": "7654321", "name": "서울중학교"},
    ]


def test_analyze_battle_returns_two_schools_and_verdict() -> None:
    result = asyncio.run(
        analysis.analyze_battle(DeterministicAreaEvaluator(), _loader, _schools(), "20260807", "프롬프트")
    )
    assert len(result["schools"]) == 2
    assert result["battle"]["outcome"] in {"win", "tie"}
    assert result["pattern"] == WORKFLOW_PATTERN


def test_agui_stream_emits_protocol_events_in_order() -> None:
    async def collect() -> list[dict[str, Any]]:
        events = []
        async for chunk in analysis.stream_agui_events(
            DeterministicAreaEvaluator(), _loader, _schools(), "20260807", "프롬프트", "thread", "run"
        ):
            assert chunk.startswith("data: ") and chunk.endswith("\n\n")
            events.append(json.loads(chunk[6:]))
        return events

    events = asyncio.run(collect())
    types = [event["type"] for event in events]
    assert types[0] == "RUN_STARTED"
    assert types[-1] == "RUN_FINISHED"
    assert types.count("STEP_STARTED") == 2 and types.count("STEP_FINISHED") == 2
    assert "TEXT_MESSAGE_START" in types and "TEXT_MESSAGE_END" in types
    names = [event.get("name") for event in events if event["type"] == "CUSTOM"]
    assert names.count("workflow.area") == len(RUBRIC_AREAS) * 2
    assert "workflow.graph" in names and "workflow.battle" in names
    assert analysis.__name__


def test_analysis_prompt_includes_both_schools() -> None:
    prompt = analysis.build_prompt("A고", "B중", "20260807", "서울특별시", "경기도")
    assert prompt == "A고(서울특별시)와 B중(경기도)의 2026-08-07 기준 중식을 비교 분석해 주세요."


def test_rubric_endpoint_exposes_weights() -> None:
    with TestClient(app) as client:
        payload = client.get("/api/analysis/rubric").json()
    assert payload["totalWeight"] == 100
    assert sum(area["weight"] for area in payload["areas"]) == 100


def test_workflow_endpoint_returns_graph() -> None:
    with TestClient(app) as client:
        payload = client.get("/api/analysis/workflow").json()
    assert payload["pattern"] == WORKFLOW_PATTERN


def test_official_devui_is_mounted_by_backend() -> None:
    assert main.DEVUI_MOUNTED is True
    headers = {"Host": "127.0.0.1"}
    with TestClient(app) as client:
        entities = client.get("/v1/entities", headers=headers)
        ui = client.get("/", headers=headers)
        health = client.get("/health", headers=headers)
    assert ui.status_code == 200
    assert health.json() == {"status": "ok"}
    assert entities.status_code == 200
    ids = [entity["id"] for entity in entities.json()["entities"]]
    assert any("school-lunch-evaluation" in entity_id for entity_id in ids)


def test_parse_request_accepts_text_and_mapping() -> None:
    payload = {
        "schoolName": "테스트고",
        "date": "20260601",
        "facts": {"menu": ["백미밥", "미역국"], "calorieInfo": "700 Kcal"},
    }
    from_text = parse_request(json.dumps(payload, ensure_ascii=False))
    from_mapping = parse_request(payload)
    assert from_text == from_mapping
    assert from_text.school_name == "테스트고"
    assert from_text.facts.menu == ("백미밥", "미역국")
    assert from_text.facts.calorie_info == "700 Kcal"


@pytest.mark.parametrize("payload", ["not-json", "[]", '{"facts": ["밥"]}', '{"facts": {"menu": "밥"}}'])
def test_parse_request_rejects_invalid_payloads(payload: str) -> None:
    with pytest.raises(ValueError):
        parse_request(payload)


async def test_workflow_runs_from_text_input() -> None:
    workflow = build_workflow(DeterministicAreaEvaluator())
    payload = json.dumps(
        {"schoolName": "테스트고", "date": "20260601", "facts": {"menu": list(RICH_MENU)}},
        ensure_ascii=False,
    )
    outputs = (await workflow.run(payload)).get_outputs()
    assert outputs and outputs[0]["schoolName"] == "테스트고"
    assert len(outputs[0]["areas"]) == len(RUBRIC_AREAS)


def test_random_schools_sample_multiple_education_offices(monkeypatch: pytest.MonkeyPatch) -> None:
    requested: list[str] = []

    async def fake_fetch(path: str, params: dict[str, str]) -> dict[str, Any]:
        assert path == "/schoolInfo"
        office = params["ATPT_OFCDC_SC_CODE"]
        requested.append(office)
        rows = [
            {
                "ATPT_OFCDC_SC_CODE": office,
                "SD_SCHUL_CODE": f"{office}{index:05d}",
                "SCHUL_NM": f"{office}학교{index}",
                "SCHUL_KND_SC_NM": "고등학교",
            }
            for index in range(5)
        ]
        return {"schoolInfo": [{"head": [{"list_total_count": len(rows)}]}, {"row": rows}]}

    monkeypatch.setattr(main, "fetch_neis", fake_fetch)
    with TestClient(app) as client:
        items = client.get("/api/schools/random").json()["items"]

    assert len(requested) == main.RANDOM_SCHOOL_OFFICE_COUNT
    assert len(set(requested)) == main.RANDOM_SCHOOL_OFFICE_COUNT
    assert set(requested) <= set(main.EDUCATION_OFFICE_CODES)
    assert len(items) == main.RANDOM_SCHOOL_POOL_SIZE
    # 특정 지역에 치우치지 않고 여러 시도교육청 학교가 함께 포함된다.
    assert len({item["educationOfficeCode"] for item in items}) > 1


def test_random_schools_read_a_random_page_per_office(monkeypatch: pytest.MonkeyPatch) -> None:
    """이름순 첫 페이지에 쏠리지 않도록 전체 건수 기반으로 임의 페이지를 읽는다."""

    pages: list[str] = []

    async def fake_fetch(path: str, params: dict[str, str]) -> dict[str, Any]:
        office = params["ATPT_OFCDC_SC_CODE"]
        pages.append(params.get("pIndex", "1"))
        return {
            "schoolInfo": [
                {"head": [{"list_total_count": 1000}]},
                {"row": [{"ATPT_OFCDC_SC_CODE": office, "SD_SCHUL_CODE": f"{office}1", "SCHUL_NM": f"{office}학교"}]},
            ]
        }

    monkeypatch.setattr(main, "fetch_neis", fake_fetch)
    with TestClient(app) as client:
        client.get("/api/schools/random")

    # 교육청마다 건수 확인용 1페이지와 임의 페이지를 각각 한 번씩 읽는다.
    assert len(pages) == main.RANDOM_SCHOOL_OFFICE_COUNT * 2
    requested_pages = {int(page) for page in pages}
    assert requested_pages <= set(range(1, 1000 // main.RANDOM_SCHOOL_PAGE_SIZE + 1))


@pytest.mark.parametrize(
    "payload,expected",
    [
        ({"schoolInfo": [{"head": [{"list_total_count": 250}]}]}, 3),
        ({"schoolInfo": [{"head": [{"list_total_count": 100}]}]}, 1),
        ({"schoolInfo": [{"head": [{"list_total_count": 0}]}]}, 1),
        ({"schoolInfo": [{"head": [{"list_total_count": "bad"}]}]}, 1),
        ({"schoolInfo": [{"row": []}]}, 1),
        ({}, 1),
    ],
)
def test_last_page_handles_counts_and_malformed_heads(payload: dict[str, Any], expected: int) -> None:
    assert main._last_page(payload, 100) == expected


def test_random_schools_skip_failing_education_offices(monkeypatch: pytest.MonkeyPatch) -> None:
    survivor = main.EDUCATION_OFFICE_CODES[0]

    async def fake_fetch(path: str, params: dict[str, str]) -> dict[str, Any]:
        if params["ATPT_OFCDC_SC_CODE"] != survivor:
            raise main.ApiError("UPSTREAM_UNAVAILABLE", "unavailable")
        return {
            "schoolInfo": [
                {"row": [{"ATPT_OFCDC_SC_CODE": survivor, "SD_SCHUL_CODE": "1000001", "SCHUL_NM": "생존학교"}]}
            ]
        }

    monkeypatch.setattr(main, "fetch_neis", fake_fetch)
    monkeypatch.setattr(main.random, "sample", lambda population, count: list(population)[:count])
    with TestClient(app) as client:
        response = client.get("/api/schools/random")

    assert response.status_code == 200
    assert [item["name"] for item in response.json()["items"]] == ["생존학교"]


def test_analysis_rejects_wrong_school_count() -> None:
    with TestClient(app) as client:
        response = client.post("/api/analysis", json={"schools": _schools()[:1], "date": _valid_date(), "prompt": ""})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_SCHOOL_SELECTION"


def test_analysis_rejects_duplicate_schools() -> None:
    duplicated = [_schools()[0], _schools()[0]]
    with TestClient(app) as client:
        response = client.post("/api/analysis", json={"schools": duplicated, "date": _valid_date(), "prompt": ""})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_SCHOOL_SELECTION"


def test_analysis_rejects_out_of_range_date() -> None:
    stale = (date.today() - timedelta(days=200)).strftime("%Y%m%d")
    with TestClient(app) as client:
        response = client.post("/api/analysis", json={"schools": _schools(), "date": stale, "prompt": ""})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_ANALYSIS_DATE"


def test_analysis_prompt_endpoint_rejects_out_of_range_date() -> None:
    stale = (date.today() - timedelta(days=200)).strftime("%Y%m%d")
    with TestClient(app) as client:
        response = client.get("/api/analysis/prompt", params={"first": "A", "second": "B", "date": stale})
    assert response.status_code == 400
