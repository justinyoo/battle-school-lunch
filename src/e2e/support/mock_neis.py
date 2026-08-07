import json
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


def result(code: str, message: str) -> dict[str, object]:
    return {"RESULT": {"CODE": code, "MESSAGE": message}}


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
            if term == "오류학교":
                self.send_json(result("ERROR-300", "deterministic upstream failure"))
            elif term == "없는학교":
                self.send_json(result("INFO-200", "해당하는 데이터가 없습니다."))
            else:
                self.send_json(
                    {
                        "schoolInfo": [
                            {"head": [{"list_total_count": len(SCHOOLS)}, result("INFO-000", "정상 처리되었습니다.")]},
                            {"row": SCHOOLS},
                        ]
                    }
                )
            return
        if parsed.path.endswith("/mealServiceDietInfo"):
            required = {
                "ATPT_OFCDC_SC_CODE": "B10",
                "SD_SCHUL_CODE": "1234567",
                "MMEAL_SC_CODE": "2",
            }
            if any(params.get(key, [""])[0] != value for key, value in required.items()):
                self.send_json(result("ERROR-400", "required parameter mismatch"))
                return
            start = params.get("MLSV_FROM_YMD", [""])[0]
            end = params.get("MLSV_TO_YMD", [""])[0]
            if start <= "20260807" <= end:
                self.send_json(
                    {
                        "mealServiceDietInfo": [
                            {"head": [{"list_total_count": 1}, result("INFO-000", "정상 처리되었습니다.")]},
                            {
                                "row": [
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
                                ]
                            },
                        ]
                    }
                )
            else:
                self.send_json(result("INFO-200", "해당하는 데이터가 없습니다."))
            return
        self.send_json({"error": "not found"}, 404)

    def log_message(self, format: str, *args: object) -> None:
        return


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 8010), Handler).serve_forever()
