# 변경 기록

이 프로젝트의 주요 변경 사항은 모두 이 파일에 기록합니다.

이 문서의 형식은 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)를
기반으로 하며, 이 프로젝트는
[유의적 버전](https://semver.org/spec/v2.0.0.html)을 따릅니다.

## [미출시]

### 추가

- concurrent fan-out, sequential fan-in 멀티 에이전트 워크플로우로 두
  학교의 중식을 `EVALUATION_RUBRIC.md` 기준에 따라 비교 평가하는 급식
  배틀 분석 기능을 추가했습니다.
- 전국 무작위 학교 10곳 중 두 곳과 이번 달·직전 달 날짜를 선택하고 기본
  프롬프트를 수정할 수 있는 프론트엔드 분석 화면을 추가했습니다. 후보
  풀은 전국 17개 시도교육청에서 균등하게 표본을 뽑아 구성합니다.
- 분석 화면 아래에 워크플로우 그래프와 에이전트별 실행 상태·점수를
  실시간으로 보여주는 시각화를 추가했습니다.
- Agent Framework 공식 DevUI를 별도 프로세스(`python -c 'from app.main import run_devui; run_devui()'`,
  기본 `http://localhost:8080`)로 실행해 워크플로우를 직접 실행하고
  디버깅할 수 있게 했습니다. DevUI는 `dev` extra가 설치된 개발
  환경에서만 사용합니다.
- AG-UI 프로토콜 SSE 스트림(`POST /api/analysis/agui`)과 분석용 REST
  엔드포인트(`/api/schools/random`, `/api/analysis`,
  `/api/analysis/rubric`, `/api/analysis/workflow`,
  `/api/analysis/prompt`)를 추가했습니다.
- GitHub Copilot SDK 연동 설정(`AGENT_PROVIDER`, `COPILOT_MODEL`,
  `COPILOT_CLI_PATH`)을 추가했습니다. Copilot CLI나 자격
  증명이 없으면 외부 호출 없는 결정적 평가로 동작합니다.
- 리포지토리 관리 및 커뮤니티 운영을 위한 초기 파일을 추가했습니다.
- DevUI 워크플로우 입력이 JSON뿐 아니라 `YYYY-MM-DD`, `YYYY/MM/DD`,
  `YYYY.MM.DD`, `YYYYMMDD` 날짜가 포함된 자연어도 실행하도록 확장했습니다.

### 변경

- 백엔드 CORS 허용 메서드에 `POST`를 추가하고 nginx `/api/` 프록시의
  버퍼링을 꺼 SSE 스트림이 지연 없이 전달되도록 했습니다.
- 급식 배틀 분석 화면의 급식 조회를 백엔드 내부 NEIS 호출 대신 MCP 서버의
  `get_lunch_meals` 도구 호출로 전환했습니다. 백엔드는 `MCP_SERVER_URL`로
  대상 서버를 지정하며, MCP 서버를 사용할 수 없으면 `MCP_UNAVAILABLE`
  오류로 응답합니다. 급식 메뉴 조회 화면은 기존 내부 API를 그대로
  사용합니다.
- DevUI 실행 위치를 리포지토리 루트로 통일해 루트 `.env`의 Copilot 설정을
  일관되게 읽도록 했습니다.
- 로컬 실행 스크립트가 백엔드, MCP, DevUI, 프론트엔드를 함께 실행하고
  Ctrl+C 시 자식 프로세스 트리까지 정리하도록 개선했습니다.
- 워크플로우 시각화에서 두 학교의 상태·진행률·점수를 각각 계산하고
  표시하도록 수정해 한 학교의 결과가 다른 학교를 덮어쓰지 않게 했습니다.
- Agent Framework 호환성을 위해 백엔드 MCP SDK를 `mcp>=1.24,<2`로
  제한하고 MCP 1.x Streamable HTTP 호출을 유지했습니다.
