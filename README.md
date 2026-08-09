# 급식배틀: 초중고 급식 메뉴 조회 및 분석 앱

NEIS 공개 API를 활용한 초중고 급식 메뉴 조회 및 분석 웹 애플리케이션입니다.

## 주요 기능

- 학교 이름의 일부로 학교를 검색합니다.
- 학교와 조회할 날짜 범위를 선택합니다.
- 날짜별 중식 메뉴와 조회 결과 없음 또는 API 오류 상태를 표시합니다.
- 무작위 학교 10곳 중 두 곳을 골라 중식을 비교 평가하는 급식 배틀 분석
  화면을 제공합니다.
- `EVALUATION_RUBRIC.md`의 4개 영역을 concurrent fan-out, sequential
  fan-in 멀티 에이전트 워크플로우로 채점하고 승자·패자·동점을 판정합니다.
- 백엔드에 통합된 dev UI(`/dev/workflow`)에서 워크플로우 실행 상태를
  시각적으로 확인합니다.
- 브라우저에서 NEIS API를 직접 호출하지 않고 Python API를 통해 연동합니다.
- 공식 MCP SDK 1.x 기반 MCP 서버에서 학교·중식 조회 도구를 제공합니다.
- React 프론트엔드와 Python 백엔드를 Docker Compose로 함께 실행합니다.

## 아키텍처

| 구성 요소 | 기술 | 역할 |
| --- | --- | --- |
| 프론트엔드 | React 및 TypeScript | 학교 검색, 날짜 선택 및 급식 메뉴 표시 |
| 백엔드 | Python | NEIS API 연동, 입력값 검증 및 응답 데이터 구성 |
| MCP 서버 | Python, MCP SDK 1.x | 독립 실행되는 에이전트용 학교 검색·중식 조회 도구 |
| 실행 환경 | Docker Compose | 프론트엔드와 백엔드의 로컬 오케스트레이션 |

예정된 소스 디렉터리 구조는 다음과 같습니다.

```text
src/frontend/ React 및 TypeScript 애플리케이션
src/backend/  Python API 애플리케이션
src/mcp/      독립 Python MCP 서버
src/         openapi.json을 포함한 공용 명세
data/        원본 API 문서
```

## 개발 환경 요구사항

- Git
- Node.js 22 이상
- Python 3.12 이상
- Docker Compose를 포함한 Docker Desktop

## 설치

```sh
git clone https://github.com/justinyoo/battle-school-lunch.git
cd battle-school-lunch
```

로컬 개발 의존성을 설치합니다.

```sh
cd src/frontend
npm install

cd ../backend
uv sync --extra dev

cd ../mcp
uv sync --extra dev
```

## 애플리케이션 실행

전체 애플리케이션을 빌드하고 실행합니다.

```sh
docker compose up --build
```

브라우저는 `http://localhost:5173`, API는 `http://localhost:8000`에서
접속합니다. 급식 배틀 분석 화면은 `http://localhost:5173/#/analysis`,
워크플로우 dev UI는 `http://localhost:8000/dev/workflow`입니다. MCP 서버는
`http://localhost:8001/mcp`에서 Streamable HTTP
전송을 제공합니다. `.env.example`을 `.env`로 복사하고 NEIS API 키를 설정하세요.

## 멀티 에이전트 급식 배틀 분석

분석 화면은 무작위 학교 10곳을 제시하고 그중 정확히 두 곳과 이번 달 또는
직전 달의 날짜 하나를 선택하도록 합니다. 기본 프롬프트는 자동으로
생성되며 실행 전에 자유롭게 수정할 수 있습니다.

백엔드는 `EVALUATION_RUBRIC.md`의 네 영역을 담당하는 에이전트를 동시에
실행하고(concurrent fan-out), 결과를 하나의 종합 에이전트로 모아
가중 총점과 총평을 만듭니다(sequential fan-in). 진행 상황과 결과는 AG-UI
프로토콜 SSE 이벤트로 전달됩니다.

| 엔드포인트 | 설명 |
| --- | --- |
| `GET /api/schools/random` | 분석 대상 후보 학교 최대 10곳 |
| `GET /api/analysis/rubric` | 평가 영역, 가중치, 척도 |
| `GET /api/analysis/workflow` | 워크플로우 그래프(노드·엣지) |
| `GET /api/analysis/prompt` | 두 학교와 날짜로 만든 기본 프롬프트 |
| `POST /api/analysis` | 배틀 분석 결과를 한 번에 반환 |
| `POST /api/analysis/agui` | AG-UI 프로토콜 SSE 이벤트 스트림 |
| `GET /dev/workflow` | 백엔드 통합 워크플로우 시각화 dev UI |

기본값인 `AGENT_PROVIDER=deterministic`은 외부 모델 없이 규칙 기반으로
채점합니다. GitHub Copilot SDK를 사용하려면 `AGENT_PROVIDER=copilot`을
설정하고, 필요에 따라 `COPILOT_MODEL`, `COPILOT_CLI_PATH`로 모델과 Copilot
CLI 경로를 지정합니다. Copilot CLI나 자격 증명이 없으면 결정적 평가로 자동
전환됩니다.

Docker Compose 없이 로컬에서 두 앱을 함께 실행하려면 다음 스크립트를
사용할 수 있습니다.

```powershell
pwsh ./scripts/start-local.ps1
```

```bash
bash ./scripts/start-local.sh
```

## 개발

프론트엔드 검사를 실행합니다.

```sh
cd src/frontend
npm run build
npm test
```

백엔드 검사를 실행합니다.

```sh
cd src/backend
uv run --extra dev pytest
```

MCP 서버 검사를 실행합니다.

```sh
cd src/mcp
uv run --extra dev pytest
```

프론트엔드, 백엔드 및 MCP 테스트를 한 번에 실행하려면 다음 스크립트를 사용합니다.

```powershell
pwsh ./scripts/test-all.ps1
```

```bash
bash ./scripts/test-all.sh
```

E2E 의존성 설치 후 브라우저를 준비해야 합니다.

```sh
cd src/e2e
npm install
npx playwright install chromium
npm test
```

E2E 테스트는 실제 Vite 프론트엔드와 FastAPI 백엔드를 실행하고, 외부 NEIS
호출만 결정적인 로컬 mock 서버로 대체합니다.

## Azure 배포

Azure Developer CLI와 Bicep 배포 구성이 포함되어 있습니다. 먼저 Azure CLI와
`azd`로 로그인한 뒤, 다음처럼 환경을 만들고 NEIS API 키를 설정합니다.

```powershell
azd auth login
azd up
```

`infra/main.parameters.json`은 `${AZURE_ENV_NAME}`과 `${AZURE_LOCATION}`을
AZD 환경 값으로 치환합니다. `NEIS_API_KEY`가 설정되어 있으면 해당 값을
사용하고, 설정되지 않은 경우 대화형 `azd up` 실행 시 값을 직접 입력받습니다.
비밀 값은 파일에 저장하지 않습니다.

`azd up`은 Container Apps 환경, frontend/backend/MCP Container Apps, ACR,
Log Analytics, Application Insights, Key Vault를 프로비저닝하고 이미지를
빌드·게시합니다. MCP 서버는 `https://<mcp-app-fqdn>/mcp`에서
Streamable HTTP로 제공됩니다. API 키는 Key Vault에 저장되며 프론트엔드
이미지에는 포함되지 않습니다. 배포 후 출력되는 `FRONTEND_URL`과 `MCP_URL`을
사용하세요.

## 기여하기

개발 환경 설정 및 Pull Request 안내는
[CONTRIBUTING.md](CONTRIBUTING.md)를 참고하세요.

## 보안

취약점을 비공개로 신고하려면 [SECURITY.md](SECURITY.md)를 참고하세요.

## 라이선스

이 프로젝트는 [MIT 라이선스](LICENSE)를 따릅니다.
