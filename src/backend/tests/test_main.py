import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import ApiError, app, fetch_neis, normalize_meals, normalize_schools, split_menu


def test_menu_and_normalization():
    assert split_menu("밥<br/>국\n반찬") == ["밥", "국", "반찬"]
    assert normalize_schools({"schoolInfo": [{"row": [{"ATPT_OFCDC_SC_CODE": "B10", "SD_SCHUL_CODE": "1", "SCHUL_NM": "학교", "SCHUL_KND_SC_NM": "고등학교", "LCTN_SC_NM": "서울"}]}]})[0].name == "학교"
    payload = {"mealServiceDietInfo": [{"row": [
        {"MMEAL_SC_CODE": "1", "MMEAL_SC_NM": "조식", "MLSV_YMD": "20260801", "DDISH_NM": "제외"},
        {"MMEAL_SC_CODE": "2", "MMEAL_SC_NM": "중식", "MLSV_YMD": "20260801", "DDISH_NM": "밥<br/>국"},
    ]}]}
    assert normalize_meals(payload)[0].menu == ["밥", "국"]


def test_normalizers_handle_empty_and_malformed_sections():
    assert normalize_schools({}) == []
    assert normalize_schools({"schoolInfo": [{"row": "not-a-list"}]}) == []
    assert normalize_meals({}) == []
    assert split_menu(None) == []


@pytest.mark.asyncio
async def test_upstream_result_error_is_mapped_without_leaking_details(monkeypatch, caplog):
    payload = {
        "schoolInfo": [
            {"head": [{"RESULT": {"CODE": "ERROR-290", "MESSAGE": "secret upstream detail"}}]}
        ]
    }
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json=payload))
    original = httpx.AsyncClient

    class MockClient:
        def __init__(self, *args, **kwargs):
            self.client = original(transport=transport, base_url=kwargs["base_url"])

        async def __aenter__(self):
            await self.client.__aenter__()
            return self.client

        async def __aexit__(self, *args):
            return await self.client.__aexit__(*args)

    monkeypatch.setattr("app.main.httpx.AsyncClient", MockClient)
    with pytest.raises(ApiError) as raised:
        await fetch_neis("/schoolInfo", {"SCHUL_NM": "서울고"})
    assert raised.value.code == "UPSTREAM_ERROR"
    assert "secret" not in raised.value.message
    assert "secret upstream detail" not in caplog.text


@pytest.mark.asyncio
async def test_top_level_no_data_result_is_a_valid_empty_response(monkeypatch):
    payload = {"RESULT": {"CODE": "INFO-200", "MESSAGE": "해당하는 데이터가 없습니다."}}
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json=payload))
    original = httpx.AsyncClient

    class MockClient:
        def __init__(self, *args, **kwargs):
            self.client = original(transport=transport, base_url=kwargs["base_url"])

        async def __aenter__(self):
            await self.client.__aenter__()
            return self.client

        async def __aexit__(self, *args):
            return await self.client.__aexit__(*args)

    monkeypatch.setattr("app.main.httpx.AsyncClient", MockClient)
    assert await fetch_neis("/schoolInfo", {"SCHUL_NM": "없는학교"}) == payload


@pytest.mark.asyncio
async def test_malformed_upstream_response_is_logged_and_mapped_safely(monkeypatch, caplog):
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json={"unexpected": []}))
    original = httpx.AsyncClient

    class MockClient:
        def __init__(self, *args, **kwargs):
            self.client = original(transport=transport, base_url=kwargs["base_url"])

        async def __aenter__(self):
            await self.client.__aenter__()
            return self.client

        async def __aexit__(self, *args):
            return await self.client.__aexit__(*args)

    monkeypatch.setattr("app.main.httpx.AsyncClient", MockClient)
    with pytest.raises(ApiError) as raised:
        await fetch_neis("/schoolInfo", {"SCHUL_NM": "학교"})
    assert raised.value.code == "UPSTREAM_INVALID_RESPONSE"
    assert "malformed response" in caplog.text
    assert "unexpected" not in caplog.text


def test_invalid_range_is_rejected_before_upstream(monkeypatch):
    called = False

    async def fail(*args, **kwargs):
        nonlocal called
        called = True
        raise AssertionError

    monkeypatch.setattr("app.main.fetch_neis", fail)
    response = TestClient(app).get("/api/meals?educationOfficeCode=B10&schoolCode=123&from=20260802&to=20260801")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_DATE_RANGE"
    assert not called


def test_invalid_code_is_rejected_before_upstream(monkeypatch):
    called = False

    async def fail(*args, **kwargs):
        nonlocal called
        called = True
        raise AssertionError

    monkeypatch.setattr("app.main.fetch_neis", fail)
    response = TestClient(app).get("/api/meals?educationOfficeCode=B-10&schoolCode=123&from=20260802&to=20260803")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_EDUCATION_OFFICE_CODE"
    assert not called


@pytest.mark.asyncio
async def test_routes_use_mocked_transport(monkeypatch):
    async def fake(path, params):
        assert path == "/schoolInfo"
        assert params["SCHUL_NM"] == "학교"
        return {"schoolInfo": [{"row": [{"ATPT_OFCDC_SC_CODE": "B10", "SD_SCHUL_CODE": "1", "SCHUL_NM": "학교", "SCHUL_KND_SC_NM": "중학교", "LCTN_SC_NM": "서울"}]}]}

    monkeypatch.setattr("app.main.fetch_neis", fake)
    response = TestClient(app).get("/api/schools?name=%20학교%20")
    assert response.status_code == 200
    assert response.json()["items"][0]["schoolCode"] == "1"


def test_meals_route_maps_upstream_rows_and_request_parameters(monkeypatch):
    captured: dict[str, str] = {}

    async def fake(path, params):
        assert path == "/mealServiceDietInfo"
        captured.update(params)
        return {
            "mealServiceDietInfo": [
                {"row": [
                    {
                        "ATPT_OFCDC_SC_CODE": "B10",
                        "SD_SCHUL_CODE": "123",
                        "SCHUL_NM": "서울고등학교",
                        "MMEAL_SC_CODE": "2",
                        "MMEAL_SC_NM": "중식",
                        "MLSV_YMD": "20260807",
                        "DDISH_NM": "밥<br/>국",
                        "ORPLC_INFO": "쌀: 국내산",
                    }
                ]}
            ]
        }

    monkeypatch.setattr("app.main.fetch_neis", fake)
    response = TestClient(app).get("/api/meals?educationOfficeCode=B10&schoolCode=123&from=20260807&to=20260807")
    assert response.status_code == 200
    assert captured == {
        "ATPT_OFCDC_SC_CODE": "B10",
        "SD_SCHUL_CODE": "123",
        "MMEAL_SC_CODE": "2",
        "MLSV_FROM_YMD": "20260807",
        "MLSV_TO_YMD": "20260807",
    }
    assert response.json()["school"]["name"] == "서울고등학교"
    assert response.json()["items"][0]["menu"] == ["밥", "국"]


def test_upstream_failure_has_safe_error_response(monkeypatch):
    async def fail(*args, **kwargs):
        raise ApiError("UPSTREAM_UNAVAILABLE", "급식 정보 서비스를 잠시 사용할 수 없습니다.")

    monkeypatch.setattr("app.main.fetch_neis", fail)
    response = TestClient(app).get("/api/schools?name=서울고")
    assert response.status_code == 502
    assert response.json() == {
        "error": {
            "code": "UPSTREAM_UNAVAILABLE",
            "message": "급식 정보 서비스를 잠시 사용할 수 없습니다.",
        }
    }


@pytest.mark.parametrize(
    "path",
    [
        "/api/schools",
        "/api/schools?name=" + "가" * 51,
        "/api/meals?educationOfficeCode=B10&schoolCode=123&from=20260807",
        "/api/meals?educationOfficeCode=B10&schoolCode=123&from=2026-08-07&to=20260807",
    ],
)
def test_fastapi_request_validation_uses_error_envelope(path):
    response = TestClient(app).get(path)
    assert response.status_code == 400
    assert response.json() == {
        "error": {
            "code": "INVALID_REQUEST",
            "message": "요청 값이 올바르지 않습니다.",
        }
    }


@pytest.mark.asyncio
async def test_neis_client_uses_mock_transport(monkeypatch):
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/hub/schoolInfo"
        assert request.url.params["SCHUL_NM"] == "학교"
        return httpx.Response(200, json={"schoolInfo": []})

    transport = httpx.MockTransport(handler)
    original = httpx.AsyncClient

    class MockClient:
        def __init__(self, *args, **kwargs):
            self.client = original(transport=transport, base_url=kwargs["base_url"])

        async def __aenter__(self):
            await self.client.__aenter__()
            return self.client

        async def __aexit__(self, *args):
            return await self.client.__aexit__(*args)

    monkeypatch.setattr("app.main.httpx.AsyncClient", MockClient)
    assert await fetch_neis("/schoolInfo", {"SCHUL_NM": "학교"}) == {"schoolInfo": []}
