import os
import sys

import httpx
import pytest
from mcp.client.session import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client
from mcp.server.fastmcp.exceptions import ToolError

from school_lunch_mcp.server import (
    UpstreamError,
    fetch_neis,
    get_lunch_meals,
    mcp,
    search_schools,
)


@pytest.mark.asyncio
async def test_mcp_registers_required_tools():
    assert {tool.name for tool in await mcp.list_tools()} == {
        "search_schools",
        "get_lunch_meals",
    }


@pytest.mark.asyncio
async def test_stdio_client_can_list_mcp_tools():
    parameters = StdioServerParameters(
        command=sys.executable,
        args=["-m", "school_lunch_mcp.server"],
        cwd=os.getcwd(),
    )
    async with stdio_client(parameters) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            result = await session.list_tools()
            call_result = await session.call_tool(
                "get_lunch_meals",
                {
                    "educationOfficeCode": "B10",
                    "schoolCode": "7010569",
                    "startDate": "20260802",
                    "endDate": "20260801",
                },
            )
    assert {tool.name for tool in result.tools} == {
        "search_schools",
        "get_lunch_meals",
    }
    assert call_result.isError
    assert "조회 시작일은 종료일보다 늦을 수 없습니다." in call_result.content[0].text


@pytest.mark.asyncio
async def test_search_tool_returns_normalized_school_data(monkeypatch):
    captured: dict[str, str] = {}

    async def fake_fetch(path: str, params: dict[str, str]):
        captured.update(params)
        return {
            "schoolInfo": [
                {
                    "row": [
                        {
                            "ATPT_OFCDC_SC_CODE": "B10",
                            "SD_SCHUL_CODE": "7010569",
                            "SCHUL_NM": "예시고등학교",
                            "SCHUL_KND_SC_NM": "고등학교",
                            "LCTN_SC_NM": "서울특별시",
                        }
                    ]
                }
            ]
        }

    monkeypatch.setattr("school_lunch_mcp.server.fetch_neis", fake_fetch)
    result = await search_schools("예시고")

    assert captured == {"SCHUL_NM": "예시고"}
    assert result["items"][0]["schoolCode"] == "7010569"


@pytest.mark.asyncio
async def test_lunch_tool_filters_lunch_and_returns_empty_result(monkeypatch):
    captured: dict[str, str] = {}

    async def fake_fetch(path: str, params: dict[str, str]):
        captured.update(params)
        return {
            "mealServiceDietInfo": [
                {
                    "row": [
                        {
                            "MMEAL_SC_CODE": "1",
                            "MMEAL_SC_NM": "조식",
                            "MLSV_YMD": "20260801",
                            "DDISH_NM": "제외",
                        },
                        {
                            "MMEAL_SC_CODE": "2",
                            "MMEAL_SC_NM": "중식",
                            "MLSV_YMD": "20260801",
                            "DDISH_NM": "밥<br/>국",
                        },
                    ]
                }
            ]
        }

    monkeypatch.setattr("school_lunch_mcp.server.fetch_neis", fake_fetch)
    result = await get_lunch_meals("B10", "7010569", "20260801", "20260802")

    assert captured["MMEAL_SC_CODE"] == "2"
    assert result["items"] == [
        {
            "date": "20260801",
            "mealName": "중식",
            "menu": ["밥", "국"],
            "originInfo": None,
            "calorieInfo": None,
            "nutritionInfo": None,
        }
    ]

    async def no_meals(path: str, params: dict[str, str]):
        return {"mealServiceDietInfo": []}

    monkeypatch.setattr("school_lunch_mcp.server.fetch_neis", no_meals)
    empty = await get_lunch_meals("B10", "7010569", "20260801", "20260802")
    assert empty["items"] == []
    assert empty["message"] == "선택한 기간에 중식 정보가 없습니다."


@pytest.mark.asyncio
async def test_tool_errors_are_safe_and_skip_invalid_upstream_requests(monkeypatch):
    called = False

    async def fail(*args, **kwargs):
        nonlocal called
        called = True
        raise AssertionError

    monkeypatch.setattr("school_lunch_mcp.server.fetch_neis", fail)
    with pytest.raises(ToolError, match="조회 시작일은 종료일보다 늦을 수 없습니다."):
        await get_lunch_meals("B10", "7010569", "20260802", "20260801")
    assert not called

    async def unavailable(path: str, params: dict[str, str]):
        raise UpstreamError("급식 정보 서비스를 잠시 사용할 수 없습니다.")

    monkeypatch.setattr("school_lunch_mcp.server.fetch_neis", unavailable)
    with pytest.raises(ToolError, match="급식 정보 서비스를 잠시 사용할 수 없습니다."):
        await search_schools("예시고")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("response", "expected_message"),
    [
        (httpx.ReadTimeout("timeout"), "급식 정보 서비스를 잠시 사용할 수 없습니다."),
        (
            httpx.Response(200, json={"unexpected": []}),
            "급식 정보 서비스를 처리할 수 없습니다.",
        ),
    ],
)
async def test_neis_delay_and_invalid_response_are_mapped_safely(
    monkeypatch, response, expected_message
):
    async def handler(request: httpx.Request) -> httpx.Response:
        if isinstance(response, Exception):
            raise response
        return response

    transport = httpx.MockTransport(handler)
    original_client = httpx.AsyncClient

    class MockClient:
        def __init__(self, *args, **kwargs):
            self.client = original_client(transport=transport, base_url=kwargs["base_url"])

        async def __aenter__(self):
            await self.client.__aenter__()
            return self.client

        async def __aexit__(self, *args):
            return await self.client.__aexit__(*args)

    monkeypatch.setattr("school_lunch_mcp.server.httpx.AsyncClient", MockClient)
    with pytest.raises(UpstreamError, match=expected_message):
        await fetch_neis("/schoolInfo", {"SCHUL_NM": "예시고"})
