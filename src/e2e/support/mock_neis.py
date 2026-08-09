import json
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse


SCHOOLS = [
    {
        "ATPT_OFCDC_SC_CODE": "B10",
        "SD_SCHUL_CODE": "1234567",
        "SCHUL_NM": "서울고등학교",
        "SCHUL_KND_SC_NM": "고등학교",
        "LCTN_SC_NM": "서울특별시",
    },
    {
        "ATPT_OFCDC_SC_CODE": "B10",
        "SD_SCHUL_CODE": "7654321",
        "SCHUL_NM": "서울중학교",
        "SCHUL_KND_SC_NM": "중학교",
        "LCTN_SC_NM": "서울특별시",
    },
]


MENUS = {
    "2000001": "기장밥<br/>미역국<br/>돈까스<br/>배추김치<br/>방울토마토<br/>시금치나물",
    "2000002": "백미밥<br/>라면<br/>치킨너겟<br/>단무지",
}

ANALYSIS_SCHOOLS = [
    {
        "ATPT_OFCDC_SC_CODE": "B10",
        "SD_SCHUL_CODE": "2000001",
        "SCHUL_NM": "분석고등학교",
        "SCHUL_KND_SC_NM": "고등학교",
        "LCTN_SC_NM": "서울특별시",
    },
    {
        "ATPT_OFCDC_SC_CODE": "B10",
        "SD_SCHUL_CODE": "2000002",
        "SCHUL_NM": "분석중학교",
        "SCHUL_KND_SC_NM": "중학교",
        "LCTN_SC_NM": "서울특별시",
    },
]

ALL_SCHOOLS = SCHOOLS + ANALYSIS_SCHOOLS


def result(code: str, message: str) -> dict[str, object]:
    return {"RESULT": {"CODE": code, "MESSAGE": message}}


def meal_row(school_code: str, target_date: str) -> dict[str, object]:
    school = next(item for item in ALL_SCHOOLS if item["SD_SCHUL_CODE"] == school_code)
    return {
        "ATPT_OFCDC_SC_CODE": "B10",
        "SD_SCHUL_CODE": school_code,
        "SCHUL_NM": school["SCHUL_NM"],
        "MMEAL_SC_CODE": "2",
        "MMEAL_SC_NM": "중식",
        "MLSV_YMD": target_date,
        "DDISH_NM": MENUS[school_code],
        "CAL_INFO": "780 Kcal" if school_code == "2000001" else "980 Kcal",
        "ORPLC_INFO": "쌀 : 국내산",
        "NTR_INFO": "단백질(g) : 25.0<br/>나트륨(mg) : 820.0",
    }


class Handler(BaseHTTPRequestHandler):
    def send_json(self, payload: object, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        if parsed.path == "/health":
            self.send_json({"status": "ok"})
            return
        if parsed.path.endswith("/schoolInfo"):
            term = params.get("SCHUL_NM", [""])[0]
            office = params.get("ATPT_OFCDC_SC_CODE", [""])[0]
            if term == "오류학교":
                self.send_json(result("ERROR-300", "deterministic upstream failure"))
            elif term == "없는학교":
                self.send_json(result("INFO-200", "해당하는 데이터가 없습니다."))
            elif office and not term:
                # 무작위 학교 풀은 교육청 코드로 조회한다. 분석 전용 학교만
                # 반환해 표본 추출과 무관하게 두 학교가 항상 풀에 포함되도록 한다.
                rows = ANALYSIS_SCHOOLS
                self.send_json(
                    {
                        "schoolInfo": [
                            {"head": [{"list_total_count": len(rows)}, result("INFO-000", "정상 처리되었습니다.")]},
                            {"row": rows},
                        ]
                    }
                )
            else:
                self.send_json(
                    {
                        "schoolInfo": [
                            {
                                "head": [
                                    {"list_total_count": len(SCHOOLS)},
                                    result("INFO-000", "정상 처리되었습니다."),
                                ]
                            },
                            {"row": SCHOOLS},
                        ]
                    }
                )
            return
        if parsed.path.endswith("/mealServiceDietInfo"):
            school_code = params.get("SD_SCHUL_CODE", [""])[0]
            if params.get("ATPT_OFCDC_SC_CODE", [""])[0] != "B10" or params.get("MMEAL_SC_CODE", [""])[0] != "2":
                self.send_json(result("ERROR-400", "required parameter mismatch"))
                return
            start = params.get("MLSV_FROM_YMD", [""])[0]
            end = params.get("MLSV_TO_YMD", [""])[0]
            rows: list[dict[str, object]] = []
            if school_code == "1234567" and start <= "20260807" <= end:
                rows.append(
                    {
                        "ATPT_OFCDC_SC_CODE": "B10",
                        "SD_SCHUL_CODE": "1234567",
                        "SCHUL_NM": "서울고등학교",
                        "MMEAL_SC_CODE": "2",
                        "MMEAL_SC_NM": "중식",
                        "MLSV_YMD": "20260807",
                        "DDISH_NM": "쌀밥<br/>된장국<br/>제육볶음",
                        "CAL_INFO": "650 Kcal",
                    }
                )
            elif school_code in MENUS and start == end and self._is_analysis_window(start):
                rows.append(meal_row(school_code, start))
            if rows:
                self.send_json(
                    {
                        "mealServiceDietInfo": [
                            {"head": [{"list_total_count": len(rows)}, result("INFO-000", "정상 처리되었습니다.")]},
                            {"row": rows},
                        ]
                    }
                )
            else:
                self.send_json(result("INFO-200", "해당하는 데이터가 없습니다."))
            return
        self.send_json({"error": "not found"}, 404)

    @staticmethod
    def _is_analysis_window(value: str) -> bool:
        if not value.isdigit() or len(value) != 8:
            return False
        today = date.today()
        previous = (today.year - 1, 12) if today.month == 1 else (today.year, today.month - 1)
        return (int(value[:4]), int(value[4:6])) in {(today.year, today.month), previous}

    def log_message(self, format: str, *args: object) -> None:
        return


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 8010), Handler).serve_forever()
