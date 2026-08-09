from datetime import date
import logging
import os
import re
from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ToolError
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    neis_api_key: str = ""
    neis_base_url: str = "https://open.neis.go.kr/hub"
    mcp_host: str = "0.0.0.0"
    mcp_port: int = 8001
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)


class UpstreamError(Exception):
    def __init__(self, message: str) -> None:
        self.message = message


settings = Settings()
logger = logging.getLogger(__name__)


def _rows(payload: dict[str, Any], section_name: str) -> list[dict[str, Any]]:
    section = payload.get(section_name, [])
    if not isinstance(section, list):
        return []
    return [
        row
        for entry in section
        if isinstance(entry, dict) and isinstance(entry.get("row"), list)
        for row in entry["row"]
        if isinstance(row, dict)
    ]


def _validate_neis_payload(payload: object, section_name: str) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("response root is not an object")

    results: list[dict[str, Any]] = []
    if "RESULT" in payload:
        if not isinstance(payload["RESULT"], dict):
            raise ValueError("top-level RESULT is malformed")
        results.append(payload["RESULT"])

    if section_name in payload:
        section = payload[section_name]
        if not isinstance(section, list):
            raise ValueError("response section is not a list")
        for entry in section:
            if not isinstance(entry, dict):
                raise ValueError("response section entry is not an object")
            if "head" not in entry and "row" not in entry:
                raise ValueError("response section entry has no recognized content")
            if "head" in entry:
                head = entry["head"]
                if not isinstance(head, list) or not all(
                    isinstance(item, dict) for item in head
                ):
                    raise ValueError("response head is malformed")
                for item in head:
                    if "RESULT" in item:
                        if not isinstance(item["RESULT"], dict):
                            raise ValueError("nested RESULT is malformed")
                        results.append(item["RESULT"])
            if "row" in entry and (
                not isinstance(entry["row"], list)
                or not all(isinstance(row, dict) for row in entry["row"])
            ):
                raise ValueError("response rows are malformed")
    elif not results:
        raise ValueError("expected response section is missing")

    for result in results:
        code = result.get("CODE")
        if not isinstance(code, str) or not code:
            raise ValueError("RESULT code is missing")
        if code not in ("INFO-000", "INFO-200"):
            logger.warning(
                "NEIS returned an error result",
                extra={"neis_path": section_name, "neis_code": code},
            )
            raise UpstreamError("급식 정보 서비스를 처리할 수 없습니다.")
    if section_name not in payload and any(
        result["CODE"] == "INFO-000" for result in results
    ):
        raise ValueError("successful response section is missing")
    return payload


async def fetch_neis(path: str, params: dict[str, str]) -> dict[str, Any]:
    query = {
        "KEY": settings.neis_api_key,
        "Type": "json",
        "pIndex": "1",
        "pSize": "1000",
        **params,
    }
    try:
        async with httpx.AsyncClient(
            base_url=settings.neis_base_url.rstrip("/"), timeout=10
        ) as client:
            response = await client.get(path, params=query)
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPError as error:
        logger.warning(
            "NEIS request failed",
            extra={
                "neis_path": path.strip("/"),
                "error_type": type(error).__name__,
                "status_code": (
                    error.response.status_code
                    if isinstance(error, httpx.HTTPStatusError)
                    else None
                ),
            },
        )
        raise UpstreamError("급식 정보 서비스를 잠시 사용할 수 없습니다.") from error
    except ValueError as error:
        logger.warning("NEIS returned invalid JSON", extra={"neis_path": path.strip("/")})
        raise UpstreamError("급식 정보 서비스를 처리할 수 없습니다.") from error

    try:
        return _validate_neis_payload(payload, path.strip("/"))
    except UpstreamError:
        raise
    except ValueError as error:
        logger.warning(
            "NEIS returned a malformed response",
            extra={"neis_path": path.strip("/")},
        )
        raise UpstreamError("급식 정보 서비스를 처리할 수 없습니다.") from error


def _validate_code(value: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9]{2,10}", value):
        raise ToolError("학교 코드 형식이 올바르지 않습니다.")
    return value


def _split_menu(value: str | None) -> list[str]:
    if not value:
        return []
    cleaned = re.sub(r"<br\s*/?>", "\n", value, flags=re.IGNORECASE)
    return [
        re.sub(r"<[^>]+>", "", item).strip()
        for item in cleaned.splitlines()
        if item.strip()
    ]


mcp = FastMCP(
    "School Lunch MCP",
    instructions="학교를 검색하고 선택한 학교의 날짜별 중식 급식 정보를 조회합니다.",
    host=settings.mcp_host,
    port=settings.mcp_port,
)


@mcp.tool(
    name="search_schools",
    title="학교 검색",
    description="학교 이름 일부로 학교명, 교육청 코드, 학교 코드를 검색합니다.",
)
async def search_schools(
    name: str = Field(description="검색할 학교 이름", min_length=1, max_length=50),
) -> dict[str, object]:
    search = name.strip()
    if not search:
        raise ToolError("학교명을 입력해 주세요.")
    try:
        payload = await fetch_neis("/schoolInfo", {"SCHUL_NM": search})
    except UpstreamError as error:
        raise ToolError(error.message) from error

    items = [
        {
            "educationOfficeCode": str(row["ATPT_OFCDC_SC_CODE"]),
            "schoolCode": str(row["SD_SCHUL_CODE"]),
            "name": str(row["SCHUL_NM"]),
            "schoolKind": str(row.get("SCHUL_KND_SC_NM", "")),
            "location": str(row.get("LCTN_SC_NM", "")),
        }
        for row in _rows(payload, "schoolInfo")
        if row.get("ATPT_OFCDC_SC_CODE")
        and row.get("SD_SCHUL_CODE")
        and row.get("SCHUL_NM")
    ]
    return {
        "items": items,
        "message": None if items else "검색 조건에 맞는 학교가 없습니다.",
    }


@mcp.tool(
    name="get_lunch_meals",
    title="중식 급식 조회",
    description="교육청 코드와 학교 코드, 날짜 범위로 날짜별 중식 급식 정보를 조회합니다.",
)
async def get_lunch_meals(
    educationOfficeCode: str = Field(
        description="교육청 코드", min_length=2, max_length=10
    ),
    schoolCode: str = Field(
        description="학교 코드", min_length=2, max_length=10
    ),
    startDate: str = Field(
        description="조회 시작일(YYYYMMDD)", pattern=r"^\d{8}$"
    ),
    endDate: str = Field(
        description="조회 종료일(YYYYMMDD)", pattern=r"^\d{8}$"
    ),
) -> dict[str, object]:
    _validate_code(educationOfficeCode)
    _validate_code(schoolCode)
    try:
        start = date.fromisoformat(f"{startDate[:4]}-{startDate[4:6]}-{startDate[6:]}")
        end = date.fromisoformat(f"{endDate[:4]}-{endDate[4:6]}-{endDate[6:]}")
    except ValueError as error:
        raise ToolError("날짜 형식이 올바르지 않습니다.") from error
    if start > end:
        raise ToolError("조회 시작일은 종료일보다 늦을 수 없습니다.")

    try:
        payload = await fetch_neis(
            "/mealServiceDietInfo",
            {
                "ATPT_OFCDC_SC_CODE": educationOfficeCode,
                "SD_SCHUL_CODE": schoolCode,
                "MMEAL_SC_CODE": "2",
                "MLSV_FROM_YMD": startDate,
                "MLSV_TO_YMD": endDate,
            },
        )
    except UpstreamError as error:
        raise ToolError(error.message) from error

    rows = _rows(payload, "mealServiceDietInfo")
    items = sorted(
        [
            {
                "date": str(row["MLSV_YMD"]),
                "mealName": "중식",
                "menu": _split_menu(str(row.get("DDISH_NM", ""))),
                "originInfo": row.get("ORPLC_INFO") or None,
                "calorieInfo": row.get("CAL_INFO") or None,
                "nutritionInfo": row.get("NTR_INFO") or None,
            }
            for row in rows
            if str(row.get("MMEAL_SC_CODE", "")) == "2"
            and str(row.get("MMEAL_SC_NM", "")).strip() == "중식"
            and row.get("MLSV_YMD")
        ],
        key=lambda item: str(item["date"]),
    )
    return {
        "school": {
            "educationOfficeCode": educationOfficeCode,
            "schoolCode": schoolCode,
            "name": next(
                (str(row["SCHUL_NM"]) for row in rows if row.get("SCHUL_NM")), ""
            ),
        },
        "items": items,
        "message": None if items else "선택한 기간에 중식 정보가 없습니다.",
    }


if __name__ == "__main__":
    mcp.run(transport=os.getenv("MCP_TRANSPORT", "stdio"))
