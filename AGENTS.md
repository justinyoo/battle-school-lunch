# AGENTS.md

## 프로젝트 개요

급식배틀은 NEIS 공개 API에서 학교와 중식 데이터를 조회해 날짜별로
표시하는 웹 애플리케이션입니다. React 19/TypeScript 프론트엔드와
FastAPI/Python 3.12 백엔드가 분리되어 있으며, NEIS 호출은 브라우저가 아닌
백엔드와 독립 MCP 서버에서 수행합니다.

- `src/frontend/`: Vite 기반 React 애플리케이션
- `src/backend/`: FastAPI 애플리케이션과 `pytest` 테스트
- `src/mcp/`: 공식 MCP SDK 1.x 기반 독립 MCP 서버와 `pytest` 테스트
- `src/e2e/`: Playwright 기반 브라우저 E2E 테스트와 로컬 NEIS mock
- `src/openapi.json`: 내부 API 계약
- `data/`: NEIS 공개 API 원본 명세
- `scripts/`: 로컬 실행 및 전체 테스트 스크립트
- `compose.yml`: `frontend`, `backend`, `mcp` Docker Compose 서비스

## 작업 원칙

- 작업 전에 관련 코드, 테스트, `README.md`, `TRD.md`, `src/openapi.json`을
  확인하고 요청 범위에 필요한 최소 변경만 합니다.
- 현재 구현과 문서가 충돌하면 구현, 테스트, 매니페스트를 기준으로 사실을
  확인한 뒤 관련 문서를 함께 갱신합니다.
- 공개 API의 경로, 파라미터, 응답 필드는 호환성을 유지합니다. 계약 변경이
  필요하면 `src/openapi.json`과 관련 문서·테스트를 함께 수정합니다.
- 기능 변경이나 사용자에게 보이는 동작 변경에는 관련 테스트를 추가하거나
  수정합니다. 불필요한 추상화와 사용하지 않는 확장은 만들지 않습니다.
- 기존 오류 처리, 상태 관리, 스타일 및 의존성 패턴을 재사용합니다.

## 아키텍처와 API 경계

- 프론트엔드는 `/api/schools`와 `/api/meals` 내부 API만 호출합니다. NEIS
  URL, 인증키, 페이지 파라미터, 원본 응답 형식을 브라우저에 노출하지
  않습니다.
- 백엔드는 학교 검색 시 `/schoolInfo`, 급식 조회 시
  `/mealServiceDietInfo`를 호출하고 내부 DTO로 정규화합니다.
- 급식 조회는 `MMEAL_SC_CODE=2`와 `MMEAL_SC_NM=중식`을 모두 확인하여
  중식만 반환합니다. 응답에 없는 날짜는 성공적인 빈 결과로 처리합니다.
- 백엔드 입력 경계에서 학교 코드, 날짜 형식, 날짜 범위를 검증합니다.
  오류는 `{ "error": { "code": "...", "message": "..." } }` 형식을
  유지하고 외부 API 키·상세 응답·내부 요청 정보를 노출하지 않습니다.
- NEIS 응답의 `row`를 정규화하고 최상위 또는 섹션 `head`의 `RESULT`를
  처리합니다. `INFO-000`은 정상, `INFO-200`은 빈 결과이며 그 밖의
  upstream 오류와 잘못된 JSON은 기존의 502 오류 매핑을 따릅니다.
- MCP 서버는 `src/mcp`에서 `search_schools`, `get_lunch_meals` 도구만
  제공하며, 백엔드 앱과 독립된 NEIS 검증·정규화 로직을 사용합니다. MCP
  도구 오류에도 인증키, 외부 응답 원문 또는 내부 요청 정보를 포함하지
  않습니다.
- 급식 배틀 분석은 백엔드가 `MCP_SERVER_URL`의 MCP 서버를 Streamable HTTP로
  호출해 `get_lunch_meals`로 급식을 조회합니다. MCP 서버를 사용할 수 없으면
  `MCP_UNAVAILABLE` 502 오류로 응답하며, 급식 메뉴 조회 화면은 기존
  `/api/meals` 경로를 그대로 사용합니다. 백엔드의 MCP 클라이언트 의존성은
  Agent Framework 호환 범위인 `mcp>=1.24,<2`를 유지합니다.
- 프론트엔드는 API 응답을 사용하기 전에 런타임 타입 검증을 수행합니다.
  학교명 trim 후 두 글자 이상에서 350ms 디바운스 검색을 사용하며,
  검색·급식 조회의 오래된 응답이 최신 상태를 덮어쓰지 않도록 요청 ID를
  유지합니다.
- 날짜 기본값은 브라우저 로컬 날짜입니다. 조회 범위의 모든 날짜를
  오름차순으로 렌더링하고, 데이터가 없는 날짜는 개별 빈 상태를 표시합니다.

## 설정과 보안

- 백엔드와 MCP 서버 설정은 각각 `pydantic-settings`로 `.env` 및 환경
  변수에서 읽습니다. 주요 변수는 `NEIS_API_KEY`, `NEIS_BASE_URL`,
  `CORS_ORIGINS`, `MCP_HOST`, `MCP_PORT`, `MCP_TRANSPORT`,
  `MCP_SERVER_URL`입니다.
- `.env.example`을 참고해 로컬 `.env`를 만들고, 비밀 값·자격 증명·로컬
  환경 파일은 커밋하지 않습니다.
- NEIS 인증키는 백엔드와 MCP 서버에만 전달하며 코드, 프론트엔드 번들, 로그,
  오류 응답에 하드코딩하거나 기록하지 않습니다. Azure 배포에서는 Key Vault와
  각 Container App의 관리 ID를 사용합니다.
- CORS는 허용된 프론트엔드 출처로 제한합니다. 사용자 입력과 외부 응답은
  신뢰하지 않고 기존 검증·정규화 경계를 우회하지 않습니다.
- 외부 요청에는 기존 timeout과 오류 분류를 유지하고, 무제한 재시도나
  광범위한 예외 처리로 실패를 숨기지 않습니다.

## 개발 및 실행

요구 사항은 Node.js 22 이상, Python 3.12 이상, `uv`, Docker Compose입니다.
의존성은 각 매니페스트와 lock 파일을 사용합니다.

```sh
cd src/frontend
npm install

cd ../backend
uv sync --extra dev

cd ../mcp
uv sync --extra dev

cd ../e2e
npm install
npx playwright install chromium
```

전체 서비스를 실행할 때는 다음을 사용합니다.

```sh
docker compose up --build
```

프론트엔드는 `http://localhost:5173`, 백엔드는
`http://localhost:8000`, MCP 서버는
`http://localhost:8001/mcp`, 백엔드 상태 확인은 `/health`입니다. Docker 없이
로컬 개발을 할 때는 `pwsh ./scripts/start-local.ps1` 또는
`bash ./scripts/start-local.sh`를 사용합니다. 이 스크립트는 백엔드,
Agent Framework DevUI(`http://localhost:8080`), 프론트엔드를 함께
실행합니다.

## 테스트와 검증

변경한 영역에 가장 가까운 기존 검사를 먼저 실행하고, 관련된 경우 전체
검사 스크립트를 실행합니다. 새 테스트 러너나 검사 도구를 임의로 추가하지
않습니다.

- 프론트엔드: `cd src/frontend && npm run build && npm test`
- 백엔드: `cd src/backend && uv run --extra dev pytest`
- MCP: `cd src/mcp && uv run --extra dev pytest`
- 전체: `pwsh ./scripts/test-all.ps1` 또는 `bash ./scripts/test-all.sh`
- E2E: `cd src/e2e && npm test`
- Compose 변경: `docker compose config`

프론트엔드 통합 테스트는 학교 검색·선택, 날짜 범위, 중식 결과, 빈 결과,
로딩·오류, 잘못된 날짜 범위, 오래된 응답 무시를 검증합니다. 백엔드
테스트는 입력 검증, NEIS 응답 정규화, 중식 필터링, 빈 응답, 오류 매핑을
검증하며 외부 네트워크에 의존하지 않습니다.

E2E는 Playwright가 Vite와 FastAPI를 실행하고 `src/e2e/support/mock_neis.py`
를 `NEIS_BASE_URL`로 연결해 실제 브라우저-프론트엔드-백엔드 경계를
검증합니다. 테스트에서 외부 NEIS 서비스에 접근하거나 브라우저 요청을
임의로 가로채지 않습니다.

## 문서화

- 사용자 동작, 설정, 실행 방법, API 계약, 배포 구성이 바뀌면
  `README.md`, `CONTRIBUTING.md`, `TRD.md`, `CHANGELOG.md`, 명세 중 관련
  문서를 현재 구현과 일치하도록 갱신합니다.
- 구현되지 않은 기능을 완료된 것처럼 문서화하지 않습니다.
- 주석은 코드만으로 의도나 제약을 이해하기 어려운 경우에만 추가합니다.

## 변경 및 Git 규칙

- 작업 목적이 드러나는 `feat/`, `fix/`, `docs/`, `test/`, `refactor/`
  계열 브랜치 이름을 사용합니다.
- 관련 없는 사용자 변경을 되돌리거나 파일을 정리하지 않습니다.
  `git reset --hard`, 무분별한 삭제, 강제 푸시는 사용하지 않습니다.
- 커밋 메시지는 Conventional Commits 형식(`feat:`, `fix:`, `docs:`,
  `test:`, `refactor:`, `chore:`)으로 작성하고 하나의 논리적 변경에
  집중합니다.
- Pull Request는 `.github/PULL_REQUEST_TEMPLATE.md`를 따르고 변경 목적,
  주요 변경, 실행한 검증 명령, 알려진 제한 사항을 포함합니다. 관련
  이슈는 `Closes #123` 형식으로 연결합니다.
- 보안 취약점은 공개 이슈가 아니라 `SECURITY.md`의 비공개 신고 절차를
  사용합니다.
