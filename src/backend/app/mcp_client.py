"""급식 배틀 분석에서 사용하는 MCP 클라이언트.

분석 화면은 백엔드 내부 NEIS 호출 대신 독립 MCP 서버의 `get_lunch_meals`
도구를 통해 급식 정보를 조회한다. 급식 메뉴 조회 화면은 기존 내부 API를
그대로 사용한다.
"""

from __future__ import annotations

import logging
from typing import Any

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

logger = logging.getLogger(__name__)


class McpUnavailableError(Exception):
    """MCP 서버에 연결하지 못했거나 도구 호출이 실패한 경우."""


def _tool_payload(result: Any) -> dict[str, Any]:
    if getattr(result, "is_error", None) or getattr(result, "isError", False):
        raise McpUnavailableError("MCP 도구 호출이 실패했습니다.")
    payload = getattr(result, "structured_content", None)
    if payload is None:
        payload = getattr(result, "structuredContent", None)
    if not isinstance(payload, dict):
        raise McpUnavailableError("MCP 응답 형식이 올바르지 않습니다.")
    return payload


async def call_tool(url: str, name: str, arguments: dict[str, Any], timeout: float = 20.0) -> dict[str, Any]:
    try:
        async with streamablehttp_client(url, timeout=timeout) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.call_tool(name, arguments)
    except McpUnavailableError:
        raise
    except Exception as error:  # noqa: BLE001 - 상세 원인은 노출하지 않는다
        logger.warning("MCP tool call failed", extra={"tool": name, "error_type": type(error).__name__})
        raise McpUnavailableError("급식 MCP 서버를 사용할 수 없습니다.") from error
    return _tool_payload(result)


async def load_lunch_meals(
    url: str,
    education_office_code: str,
    school_code: str,
    target_date: str,
) -> dict[str, Any]:
    """MCP `get_lunch_meals` 도구로 하루치 중식 정보를 가져온다."""

    return await call_tool(
        url,
        "get_lunch_meals",
        {
            "educationOfficeCode": education_office_code,
            "schoolCode": school_code,
            "startDate": target_date,
            "endDate": target_date,
        },
    )


__all__ = ["McpUnavailableError", "call_tool", "load_lunch_meals"]
