from contextlib import asynccontextmanager
from datetime import date
import logging
import random
import re
import uuid
from typing import Any

import httpx
from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from . import analysis
from .devui import DEV_UI_HTML
from .providers import create_evaluator
from .rubric import RUBRIC_AREAS, TOTAL_WEIGHT
from .workflow import WORKFLOW_PATTERN, workflow_graph

RANDOM_SCHOOL_POOL_SIZE = 10
RANDOM_SCHOOL_SEEDS = ("서울", "한빛", "중앙", "대전", "부산")


class Settings(BaseSettings):
    neis_api_key: str = ""
    neis_base_url: str = "https://open.neis.go.kr/hub"
    cors_origins: str = "http://localhost:5173"
    agent_provider: str = "deterministic"
    foundry_project_endpoint: str = ""
    foundry_model: str = ""
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    @property
    def origins(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


settings = Settings()
logger = logging.getLogger(__name__)


class ApiError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 502) -> None:
        self.code, self.message, self.status_code = code, message, status_code


class School(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    education_office_code: str = Field(alias="educationOfficeCode")
    school_code: str = Field(alias="schoolCode")
    name: str
    school_kind: str = Field(alias="schoolKind")
    location: str


class Meal(BaseModel):
    date: str
    meal_name: str = Field("중식", alias="mealName")
    menu: list[str]
    origin_info: str | None = Field(None, alias="originInfo")
    calorie_info: str | None = Field(None, alias="calorieInfo")
    nutrition_info: str | None = Field(None, alias="nutritionInfo")


class SchoolSummary(BaseModel):
    education_office_code: str = Field(alias="educationOfficeCode")
    school_code: str = Field(alias="schoolCode")
    name: str


class SchoolResponse(BaseModel):
    items: list[School]


class MealResponse(BaseModel):
    school: SchoolSummary
    items: list[Meal]


class AnalysisSchool(BaseModel):
    education_office_code: str = Field(alias="educationOfficeCode")
    school_code: str = Field(alias="schoolCode")
    name: str


class AnalysisRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    schools: list[AnalysisSchool]
    date: str
    prompt: str = ""


def _rows(payload: dict[str, Any], key: str) -> list[dict[str, Any]]:
    section = payload.get(key, [])
    if not isinstance(section, list):
        return []
    result: list[dict[str, Any]] = []
    for entry in section:
        if isinstance(entry, dict) and isinstance(entry.get("row"), list):
            result.extend(row for row in entry["row"] if isinstance(row, dict))
    return result


def normalize_schools(payload: dict[str, Any]) -> list[School]:
    return [
        School(
            educationOfficeCode=str(row.get("ATPT_OFCDC_SC_CODE", "")),
            schoolCode=str(row.get("SD_SCHUL_CODE", "")),
            name=str(row.get("SCHUL_NM", "")),
            schoolKind=str(row.get("SCHUL_KND_SC_NM", "")),
            location=str(row.get("LCTN_SC_NM", "")),
        )
        for row in _rows(payload, "schoolInfo")
        if row.get("ATPT_OFCDC_SC_CODE") and row.get("SD_SCHUL_CODE") and row.get("SCHUL_NM")
    ]


def split_menu(value: str | None) -> list[str]:
    if not value:
        return []
    cleaned = re.sub(r"<br\s*/?>", "\n", value, flags=re.IGNORECASE)
    return [re.sub(r"<[^>]+>", "", item).strip() for item in cleaned.splitlines() if item.strip()]


def normalize_meals(payload: dict[str, Any]) -> list[Meal]:
    return [
        Meal(
            date=str(row["MLSV_YMD"]),
            menu=split_menu(str(row.get("DDISH_NM", ""))),
            originInfo=row.get("ORPLC_INFO") or None,
            calorieInfo=row.get("CAL_INFO") or None,
            nutritionInfo=row.get("NTR_INFO") or None,
        )
        for row in _rows(payload, "mealServiceDietInfo")
        if str(row.get("MMEAL_SC_CODE", "")) == "2" and str(row.get("MMEAL_SC_NM", "")).strip() == "중식" and row.get("MLSV_YMD")
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
                if not isinstance(head, list) or not all(isinstance(item, dict) for item in head):
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
            logger.warning("NEIS returned an error result", extra={"neis_path": section_name, "neis_code": code})
            raise ApiError("UPSTREAM_ERROR", "급식 정보 서비스를 처리할 수 없습니다.")
    if section_name not in payload and any(result["CODE"] == "INFO-000" for result in results):
        raise ValueError("successful response section is missing")
    return payload


async def fetch_neis(path: str, params: dict[str, str]) -> dict[str, Any]:
    query = {"KEY": settings.neis_api_key, "Type": "json", "pIndex": "1", "pSize": "1000", **params}
    try:
        async with httpx.AsyncClient(base_url=settings.neis_base_url.rstrip("/"), timeout=10) as client:
            response = await client.get(path, params=query)
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPError as exc:
        logger.warning(
            "NEIS request failed",
            extra={
                "neis_path": path.strip("/"),
                "error_type": type(exc).__name__,
                "status_code": exc.response.status_code if isinstance(exc, httpx.HTTPStatusError) else None,
            },
        )
        raise ApiError("UPSTREAM_UNAVAILABLE", "급식 정보 서비스를 잠시 사용할 수 없습니다.") from exc
    except ValueError as exc:
        logger.warning("NEIS returned invalid JSON", extra={"neis_path": path.strip("/")})
        raise ApiError("UPSTREAM_INVALID_RESPONSE", "급식 정보 서비스를 처리할 수 없습니다.") from exc

    try:
        return _validate_neis_payload(payload, path.strip("/"))
    except ApiError:
        raise
    except ValueError as exc:
        logger.warning("NEIS returned a malformed response", extra={"neis_path": path.strip("/")})
        raise ApiError("UPSTREAM_INVALID_RESPONSE", "급식 정보 서비스를 처리할 수 없습니다.") from exc


def validate_code(value: str, label: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9]{2,10}", value):
        raise ApiError(f"INVALID_{label.upper()}", "학교 코드 형식이 올바르지 않습니다.", 400)
    return value


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield


app = FastAPI(title="School Lunch API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.origins, allow_methods=["GET", "POST"], allow_headers=["*"])


@app.exception_handler(ApiError)
async def api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"error": {"code": exc.code, "message": exc.message}})


@app.exception_handler(RequestValidationError)
async def request_validation_error_handler(_: Request, __: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={"error": {"code": "INVALID_REQUEST", "message": "요청 값이 올바르지 않습니다."}},
    )


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/schools", response_model=SchoolResponse)
async def schools(name: str = Query(min_length=1, max_length=50)) -> SchoolResponse:
    search = name.strip()
    if not search:
        raise ApiError("INVALID_SCHOOL_NAME", "학교명을 입력해 주세요.", 400)
    payload = await fetch_neis("/schoolInfo", {"SCHUL_NM": search})
    return SchoolResponse(items=normalize_schools(payload))


@app.get("/api/meals", response_model=MealResponse)
async def meals(
    education_office_code: str = Query(alias="educationOfficeCode"),
    school_code: str = Query(alias="schoolCode"),
    from_date: str = Query(alias="from", pattern=r"^\d{8}$"),
    to_date: str = Query(alias="to", pattern=r"^\d{8}$"),
) -> MealResponse:
    validate_code(education_office_code, "education_office_code")
    validate_code(school_code, "school_code")
    try:
        start, end = date.fromisoformat(f"{from_date[:4]}-{from_date[4:6]}-{from_date[6:]}"), date.fromisoformat(f"{to_date[:4]}-{to_date[4:6]}-{to_date[6:]}")
    except ValueError as exc:
        raise ApiError("INVALID_DATE", "날짜 형식이 올바르지 않습니다.", 400) from exc
    if start > end:
        raise ApiError("INVALID_DATE_RANGE", "조회 시작일은 종료일보다 늦을 수 없습니다.", 400)
    payload = await fetch_neis("/mealServiceDietInfo", {"ATPT_OFCDC_SC_CODE": education_office_code, "SD_SCHUL_CODE": school_code, "MMEAL_SC_CODE": "2", "MLSV_FROM_YMD": from_date, "MLSV_TO_YMD": to_date})
    rows = _rows(payload, "mealServiceDietInfo")
    school_name = next((str(row.get("SCHUL_NM")) for row in rows if row.get("SCHUL_NM")), "")
    return MealResponse(school=SchoolSummary(educationOfficeCode=education_office_code, schoolCode=school_code, name=school_name), items=sorted(normalize_meals(payload), key=lambda item: item.date))


def _evaluator():
    return create_evaluator(settings.agent_provider, settings.foundry_project_endpoint, settings.foundry_model)


async def _load_meals(education_office_code: str, school_code: str, target_date: str) -> dict[str, Any]:
    response = await meals(
        education_office_code=education_office_code,
        school_code=school_code,
        from_date=target_date,
        to_date=target_date,
    )
    return response.model_dump(by_alias=True)


def _validate_analysis_date(value: str) -> str:
    if not re.fullmatch(r"\d{8}", value):
        raise ApiError("INVALID_DATE", "날짜 형식이 올바르지 않습니다.", 400)
    try:
        parsed = date.fromisoformat(f"{value[:4]}-{value[4:6]}-{value[6:]}")
    except ValueError as exc:
        raise ApiError("INVALID_DATE", "날짜 형식이 올바르지 않습니다.", 400) from exc
    today = date.today()
    this_month = (today.year, today.month)
    previous_month = (today.year - 1, 12) if today.month == 1 else (today.year, today.month - 1)
    if (parsed.year, parsed.month) not in (this_month, previous_month):
        raise ApiError("INVALID_ANALYSIS_DATE", "이번 달 또는 직전 달의 날짜만 분석할 수 있습니다.", 400)
    return value


def _validate_analysis_schools(schools: list[AnalysisSchool]) -> list[dict[str, str]]:
    if len(schools) != 2:
        raise ApiError("INVALID_SCHOOL_SELECTION", "학교를 정확히 두 곳 선택해 주세요.", 400)
    codes = {(item.education_office_code, item.school_code) for item in schools}
    if len(codes) != 2:
        raise ApiError("INVALID_SCHOOL_SELECTION", "서로 다른 학교 두 곳을 선택해 주세요.", 400)
    for item in schools:
        validate_code(item.education_office_code, "education_office_code")
        validate_code(item.school_code, "school_code")
    return [
        {
            "educationOfficeCode": item.education_office_code,
            "schoolCode": item.school_code,
            "name": item.name.strip() or item.school_code,
        }
        for item in schools
    ]


@app.get("/api/schools/random", response_model=SchoolResponse)
async def random_schools() -> SchoolResponse:
    collected: dict[tuple[str, str], School] = {}
    for seed in RANDOM_SCHOOL_SEEDS:
        payload = await fetch_neis("/schoolInfo", {"SCHUL_NM": seed})
        for item in normalize_schools(payload):
            collected[(item.education_office_code, item.school_code)] = item
        if len(collected) >= RANDOM_SCHOOL_POOL_SIZE:
            break
    pool = list(collected.values())
    if not pool:
        return SchoolResponse(items=[])
    sample_size = min(RANDOM_SCHOOL_POOL_SIZE, len(pool))
    return SchoolResponse(items=random.sample(pool, sample_size))


@app.get("/api/analysis/rubric")
async def analysis_rubric() -> dict[str, Any]:
    return {
        "totalWeight": TOTAL_WEIGHT,
        "pattern": WORKFLOW_PATTERN,
        "provider": settings.agent_provider,
        "areas": [
            {
                "id": area.id,
                "agentName": area.agent_name,
                "title": area.title,
                "weight": area.weight,
                "purpose": area.purpose,
                "checkpoints": list(area.checkpoints),
                "scale": list(area.scale),
            }
            for area in RUBRIC_AREAS
        ],
    }


@app.get("/api/analysis/workflow")
async def analysis_workflow() -> dict[str, Any]:
    return workflow_graph()


@app.get("/api/analysis/prompt")
async def analysis_prompt(
    first: str = Query(min_length=1, max_length=50),
    second: str = Query(min_length=1, max_length=50),
    target_date: str = Query(alias="date", pattern=r"^\d{8}$"),
) -> dict[str, str]:
    _validate_analysis_date(target_date)
    return {"prompt": analysis.build_prompt(first.strip(), second.strip(), target_date)}


@app.post("/api/analysis")
async def analysis_run(request: AnalysisRequest) -> dict[str, Any]:
    schools = _validate_analysis_schools(request.schools)
    target_date = _validate_analysis_date(request.date)
    prompt = request.prompt.strip() or analysis.build_prompt(schools[0]["name"], schools[1]["name"], target_date)
    return await analysis.analyze_battle(_evaluator(), _load_meals, schools, target_date, prompt)


@app.post("/api/analysis/agui")
async def analysis_agui(request: AnalysisRequest) -> StreamingResponse:
    schools = _validate_analysis_schools(request.schools)
    target_date = _validate_analysis_date(request.date)
    prompt = request.prompt.strip() or analysis.build_prompt(schools[0]["name"], schools[1]["name"], target_date)
    stream = analysis.stream_agui_events(
        _evaluator(),
        _load_meals,
        schools,
        target_date,
        prompt,
        thread_id=uuid.uuid4().hex,
        run_id=uuid.uuid4().hex,
    )
    return StreamingResponse(stream, media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


@app.get("/dev/workflow", response_class=HTMLResponse)
async def dev_workflow() -> HTMLResponse:
    return HTMLResponse(DEV_UI_HTML)
