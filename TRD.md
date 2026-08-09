# 급식 배틀 - 기술 설계 문서

## 1. 설계 목표

React 프론트엔드, Python 백엔드 및 독립 Python MCP 서버를 분리한다.
브라우저는 내부 HTTP API만 호출하며, 백엔드와 MCP 서버만 NEIS 공개 API와
통신한다. 프론트엔드는 사용자 흐름과 화면 상태를 담당하고, 각 서버는
입력 검증, 외부 API 호출, 응답 정규화 및 오류 변환을 담당한다. 세
애플리케이션은 Docker Compose로 함께 빌드하고 실행한다.

## 2. 시스템 구성

```text
사용자 브라우저
    |
    v
React 프론트엔드
    |  내부 HTTP API
    v
Python 백엔드
    |  인증키를 포함한 서버 측 요청
    v
NEIS Open API
    |  /schoolInfo, /mealServiceDietInfo
    v
Python 백엔드 -> 정규화된 JSON -> React 프론트엔드

MCP 클라이언트 또는 급식 배틀 분석 백엔드
    |  Streamable HTTP 또는 stdio
    v
Python MCP 서버 -> 정규화된 JSON -> NEIS Open API
```

### 2.1 프론트엔드

- React 및 TypeScript로 구현한다.
- 학교 검색, 학교 선택, 날짜 범위 선택, 중식 결과 표시의 3단계 UI를
  제공한다.
- 백엔드의 내부 HTTP API만 호출하며 NEIS URL, 인증키, NEIS 응답 형식을
  브라우저 코드에 직접 노출하지 않는다.
- 각 요청에 대해 초기·로딩·성공·빈 결과·오류 상태를 관리한다.
- API 응답을 화면에 표시하기 전 필요한 타입 검증을 수행한다.
- trim한 학교명이 두 글자 이상일 때 350ms 디바운스로 자동 검색한다. 검색과
  급식 조회에 각각 증가하는 요청 식별자를 두어 마지막 요청만 상태를
  갱신하고, 새 급식 조회 시작·실패·학교 또는 기간 변경 시 이전 결과를
  제거한다.
- 날짜 기본값은 브라우저 로컬 날짜를 사용하고, 요청 범위의 날짜 목록과
  응답을 결합하여 응답에 없는 날짜도 개별 빈 상태로 렌더링한다.

### 2.2 백엔드

- Python 기반 HTTP API 애플리케이션으로 구현한다.
- 프론트엔드 입력값을 경계에서 검증하고 잘못된 요청은 4xx로 응답한다.
- 서버 설정에서 NEIS 인증키와 외부 API 기본 URL을 읽는다. 인증키는
  소스 코드나 프론트엔드 번들에 하드코딩하지 않는다.
- `src/openapi.json`의 외부 계약을 기준으로 NEIS 요청 파라미터와 응답
  필드를 매핑한다.
- NEIS 응답의 `row` 데이터를 추출하고 `NeisHead.RESULT` 또는 외부
  HTTP 오류를 내부의 일관된 오류 응답으로 변환한다.
- `RESULT`가 최상위 또는 각 API 섹션의 `head`에 오는 두 형식을 처리한다.
  `INFO-000`은 정상, `INFO-200`은 빈 결과로 처리하며, 그 밖의 코드와
  구조가 잘못된 JSON은 안전한 502 오류로 변환한다. 로그에는 경로·오류
  분류·NEIS 코드만 기록하고 키, 원문 메시지, 응답 본문은 기록하지 않는다.
- `ATPT_OFCDC_SC_CODE`와 `SD_SCHUL_CODE`로 학교를 식별하고,
  `MLSV_FROM_YMD`, `MLSV_TO_YMD` 및 `MMEAL_SC_CODE=2`로 급식을 조회한다.
- 프론트엔드에는 학교 식별에 필요한 필드와 날짜별 중식 결과만 반환한다.

### 2.3 MCP 서버

- 공식 Python MCP SDK 1.x의 `FastMCP`로 별도 프로세스를 실행한다.
- Streamable HTTP는 기본적으로 `http://localhost:8001/mcp`에서, 로컬
  도구 통합은 stdio 전송으로 제공한다.
- `search_schools` 도구는 학교명 일부로 이름, 교육청 코드, 학교 코드를
  반환한다. `get_lunch_meals` 도구는 `educationOfficeCode`, `schoolCode`,
  `startDate`, `endDate`로 중식만 반환한다.
- `src/mcp`가 설정, NEIS 요청, 입력 검증 및 정규화를 독립적으로 소유한다.
  입력 및 upstream 오류는 민감한 원문을 포함하지 않는 MCP 도구 오류로
  반환하며, 검색·급식 결과 없음은 빈 `items`와 명확한 메시지로 반환한다.
- 급식 배틀 분석은 백엔드 내부 NEIS 호출 대신 이 MCP 서버의
  `get_lunch_meals` 도구를 Streamable HTTP로 호출해 급식 정보를 가져온다.
  백엔드는 `MCP_SERVER_URL` 설정으로 대상 서버를 지정하며, 연결이나 도구
  호출이 실패하면 `MCP_UNAVAILABLE` 코드의 502 오류로 응답한다. 급식 메뉴
  조회 화면은 기존 `/api/meals` 내부 API 경로를 그대로 사용한다.
- 백엔드의 MCP 클라이언트 의존성은 Agent Framework가 요구하는 범위에 맞춰
  `mcp>=1.24,<2`로 고정한다. MCP SDK 2.x는 Agent Framework가 지원하지
  않으므로 사용하지 않는다.

## 3. 내부 API 설계

내부 경로와 세부 프레임워크는 구현 시 결정하되, 기능 계약은 다음처럼
유지한다. 내부 API는 NEIS의 필수 인증키, 페이지 파라미터를 클라이언트가
전달하지 않도록 한다.

### 3.1 학교 검색

`GET /api/schools?name={부분학교명}`

응답 예시:

```json
{
  "items": [
    {
      "educationOfficeCode": "B10",
      "schoolCode": "7010569",
      "name": "예시고등학교",
      "schoolKind": "고등학교",
      "location": "서울특별시"
    }
  ]
}
```

백엔드는 `name`을 trim하고 빈 값과 과도하게 긴 값을 거부한다. 결과가
없으면 성공 응답의 빈 `items`를 사용하여 프론트엔드가 "검색 결과 없음"을
구분하도록 한다. 프론트엔드는 trim한 두 글자 이상 입력만 자동 요청한다.

### 3.2 급식 조회

`GET /api/meals?educationOfficeCode={코드}&schoolCode={코드}&from={YYYYMMDD}&to={YYYYMMDD}`

응답 예시:

```json
{
  "school": {
    "educationOfficeCode": "B10",
    "schoolCode": "7010569",
    "name": "예시고등학교"
  },
  "items": [
    {
      "date": "20260805",
      "mealName": "중식",
      "menu": ["쌀밥", "된장국", "채소반찬"],
      "originInfo": "쌀: 국내산",
      "calorieInfo": "650 Kcal",
      "nutritionInfo": "..."
    }
  ]
}
```

백엔드는 코드 형식, 날짜 형식, 시작일·종료일 관계를 검증한다. 외부 요청은
항상 `MMEAL_SC_CODE=2`를 포함한다. 조회
결과가 없으면 오류가 아닌 빈 `items`를 반환한다. `MMEAL_SC_CODE`는
프로젝트에서 정한 중식 코드로 고정하고, 외부 데이터의 `MMEAL_SC_NM`도
확인하여 중식 외 데이터가 결과에 섞이지 않도록 한다.

### 3.3 오류 형식

```json
{
  "error": {
    "code": "INVALID_DATE_RANGE",
    "message": "조회 시작일은 종료일보다 늦을 수 없습니다."
  }
}
```

클라이언트 입력 오류는 400, 외부 서비스 일시 오류는 502 또는 503,
서버 내부 오류는 500으로 구분한다. 외부 API의 인증키·요청 URL·상세
응답을 `message`에 포함하지 않는다. 로그에는 운영에 필요한 오류 코드와
추적 정보만 남기고 비밀 값을 기록하지 않는다.
FastAPI가 생성하는 누락·형식·길이 검증 오류도 기본 `detail` 배열 대신
400과 동일한 `error.code`, `error.message` 봉투로 변환한다. 프론트엔드는
이 봉투가 유효할 때만 서버 메시지를 표시하고 그 외 응답에는 일반 오류
문구를 사용한다.

### 3.4 급식 배틀 분석 API

멀티 에이전트 분석은 기존 백엔드 앱에 통합된다. 별도 서비스나 프로세스를
추가하지 않고 `/api/analysis` 하위 경로와 루트(`/`) DevUI 마운트만 늘린다.

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/schools/random` | 전국 후보 학교 최대 10곳을 무작위로 반환 |
| GET | `/api/analysis/rubric` | 평가 영역, 가중치, 5점 척도 |
| GET | `/api/analysis/workflow` | 워크플로우 노드와 엣지 그래프 |
| GET | `/api/analysis/prompt` | 두 학교와 날짜로 만든 기본 프롬프트 |
| POST | `/api/analysis` | 배틀 분석 결과 |
| POST | `/api/analysis/agui` | AG-UI 프로토콜 SSE 스트림 |
| GET | `/` | Agent Framework 공식 DevUI(개발 환경 전용) |

입력 경계에서 학교가 정확히 두 곳인지, 서로 다른 학교인지, 날짜가 이번 달
또는 직전 달인지 확인한다. 위반 시 각각 `INVALID_SCHOOL_SELECTION`,
`INVALID_ANALYSIS_DATE` 코드로 400을 반환한다.

`/api/schools/random`은 전국 17개 시도교육청 코드 중 다섯 곳을 무작위로
고른 뒤, 각 교육청의 전체 건수를 확인해 임의 페이지에서 표본을 뽑는다.
이름순 첫 페이지나 특정 지역에 결과가 쏠리지 않게 하기 위한 것이며, 일부
교육청 조회가 실패해도 나머지 지역으로 풀을 구성한다.

### 3.5 멀티 에이전트 워크플로우

Microsoft Agent Framework의 `WorkflowBuilder`로 concurrent fan-out,
sequential fan-in 구조를 구성한다.

1. `prepare-meal-facts`가 급식 응답을 평가용 사실 집합으로 정규화한다.
2. `add_fan_out_edges`로 네 영역 에이전트를 동시에 실행한다.
   `nutrition-health-agent`(35점), `ingredient-safety-agent`(25점),
   `menu-variety-preference-agent`(25점), `sustainability-value-agent`(15점).
3. `add_fan_in_edges`로 `final-synthesis-agent`가 결과를 모아 가중 총점과
   총평을 만든다.
4. 두 학교의 총점을 비교해 승자·패자 또는 동점을 판정한다.

영역별 점수는 5점 척도이며 `점수 / 5 × 가중치`로 환산한다. 가중치 합은
항상 100이다. 근거가 없는 항목은 추정하지 않고 확인 불가로 남긴다.

`AGENT_PROVIDER=copilot`이면 Microsoft Agent Framework의
`GitHubCopilotAgent`(GitHub Copilot SDK)로 채점하고, 그렇지 않으면
외부 호출 없는 결정적 평가자로 동작한다. `COPILOT_MODEL`,
`COPILOT_CLI_PATH`로 모델과 Copilot CLI 경로를 지정할 수 있다. 테스트와
E2E는 결정적 평가자를 사용해 외부 서비스에 의존하지 않는다.

### 3.6 AG-UI 이벤트 경계

`/api/analysis/agui`는 `text/event-stream`으로 `RUN_STARTED`,
`CUSTOM(workflow.graph)`, 학교별 `STEP_STARTED`,
`CUSTOM(workflow.area)`, `CUSTOM(workflow.school)`, `STEP_FINISHED`,
`CUSTOM(workflow.battle)`, `TEXT_MESSAGE_START|CONTENT|END`,
`RUN_FINISHED` 순으로 이벤트를 보낸다. 실패 시 상세 원인 대신
`RUN_ERROR`와 일반화된 메시지만 전달한다. nginx 프록시에서는 이 경로의
버퍼링을 끈다.

프론트엔드 분석 화면은 이 이벤트를 구독해 결과 영역 아래의 워크플로우
그래프를 갱신한다. `STEP_STARTED`는 영역 노드를 실행 중으로,
`CUSTOM(workflow.area)`는 해당 영역 노드를 점수와 함께 완료로,
`CUSTOM(workflow.school)`은 종합 노드를 완료로 바꾼다.

### 3.7 Agent Framework 공식 DevUI

워크플로우 디버깅에는 자체 화면 대신 `agent-framework-devui`의 `DevServer`를
사용한다. `DevServer.get_app()`이 반환하는 FastAPI 앱을 기존 백엔드의
루트(`/`)에 마운트하므로 별도 프로세스나 포트를 열지 않는다. DevUI 번들이
`/meta` 같은 절대 경로를 호출해 하위 경로 마운트를 지원하지 않기 때문이며,
`/api`·`/health` 등 명시적으로 등록된 라우트가 마운트보다 우선하므로 기존
API는 영향을 받지 않는다. DevUI는 `dev`
extra에 속하므로 운영 이미지에서는 임포트에 실패하고 마운트를 건너뛴다.

DevUI는 시작 노드에 문자열이나 매핑을 전달하므로 `prepare-meal-facts`는
`EvaluationRequest` 외에 JSON 문자열과 딕셔너리 입력도 받는다. 잘못된
입력은 `ValueError`로 거부하고 내부 정보를 노출하지 않는다.

## 4. 데이터 흐름

### 4.1 학교 검색

1. 사용자가 부분 학교명을 입력하고 프론트엔드가 `/api/schools`를 호출한다.
2. 백엔드가 입력을 검증하고 NEIS `/schoolInfo`에 `Type=json`,
   `SCHUL_NM` 및 서버 측 인증·페이지 파라미터를 추가한다.
3. 백엔드가 `schoolInfo[].row[]`를 읽어 내부 학교 DTO로 정규화한다.
4. 프론트엔드가 목록을 표시하고 선택한 학교 코드를 상태에 저장한다.

### 4.2 급식 조회

1. 프론트엔드가 선택된 학교 코드와 날짜 범위를 백엔드에 전달한다.
2. 백엔드가 날짜와 코드의 유효성을 확인하고 NEIS
   `/mealServiceDietInfo`를 호출한다.
3. 백엔드는 `MLSV_YMD`, `DDISH_NM`, `ORPLC_INFO`, `CAL_INFO`,
   `NTR_INFO`를 읽고 중식만 남긴다.
4. 메뉴 문자열의 줄바꿈 또는 `<br/>` 구분을 내부 `menu` 배열로 변환한다.
5. 프론트엔드는 요청한 모든 날짜를 오름차순으로 렌더링하고, 응답 항목이
   없는 날짜에는 날짜별 빈 상태를 렌더링한다.

## 5. Docker Compose 구성

- 루트의 Compose 설정은 `frontend`, `backend`, `mcp` 세 서비스를 정의한다.
- `azure.yaml`과 `infra/modules/application.bicep`은 세 서비스를 각각 Azure
  Container Apps로 배포하며, MCP 서비스는 외부 HTTPS ingress의 `/mcp` 경로에서
  Streamable HTTP(8001)를 제공한다.
- MCP Container App은 별도 사용자 할당 관리 ID를 사용해 ACR 이미지를 pull하고
  Key Vault의 `neis-api-key` secret만 읽는다.
- 프론트엔드 서비스는 React 애플리케이션을 빌드하고 정적 자산을 제공한다.
- 백엔드 서비스는 Python 애플리케이션과 의존성을 포함하고 내부 API를
  제공한다.
- MCP 서비스는 `src/mcp`의 독립 Python 이미지를 사용해
  `school_lunch_mcp.server` 모듈을 실행하고 8001 포트에서 MCP Streamable
  HTTP를 제공한다.
- 프론트엔드의 백엔드 주소는 Compose 서비스 이름 또는 환경 변수로
  주입하며 코드에 환경별 호스트를 하드코딩하지 않는다.
- NEIS 인증키는 `.env` 또는 실행 환경의 비밀 설정으로 백엔드와 MCP에만
  전달한다. 비밀 파일은 버전 관리 대상에서 제외하며, Azure에서는 Key Vault와
  Container App 관리 ID를 사용한다.
- 서비스 간 통신에 필요한 포트와 헬스체크를 정의하고, 프론트엔드가
  백엔드 준비 전에 시작해도 명확한 오류 상태를 표시하도록 한다.
- 로컬 개발과 배포 이미지의 차이를 줄이기 위해 동일한 컨테이너 빌드
  경로를 사용한다.

## 6. 테스트 전략

### 6.1 프론트엔드 통합 테스트

프론트엔드 테스트는 개별 함수 단위가 아니라 주요 UI 흐름과 API 경계를
검증하는 통합 테스트로 작성한다.

- 학교 검색 입력, 검색 요청, 결과 목록 표시
- 학교 선택 후 날짜 범위 입력 및 조회 요청
- 날짜별 중식 결과와 메뉴 줄바꿈 표시
- 검색 결과 없음, 급식 정보 없음, 로딩 및 오류 상태
- 일부 날짜에만 급식이 있는 범위의 날짜별 빈 상태
- 잘못된 날짜 범위에서 요청이 발생하지 않는지 여부
- 오류 봉투 파싱, 로컬 날짜 기본값, 오래된 급식 응답 무시와 조회 시작·실패
  시 이전 결과 제거

백엔드 호출은 테스트에서 모킹하여 프론트엔드 상태 전이와 렌더링을
독립적으로 검증한다.

### 6.2 백엔드 단위 테스트

- 부분 학교명과 날짜·학교 코드 입력 검증
- 날짜 범위 순서 및 형식 검증
- NEIS 학교 응답의 `row` 추출 및 내부 DTO 변환
- NEIS 급식 응답의 중식 필터링과 메뉴 문자열 정규화
- 빈 응답 처리
- `NeisHead.RESULT`의 오류 코드별 내부 오류 매핑
- 인증키나 내부 요청 정보가 오류 응답과 로그에 포함되지 않는지 여부

외부 네트워크를 사용하지 않고 고정된 NEIS 응답 fixture 또는 모킹된
HTTP 클라이언트를 사용한다.

### 6.3 MCP 테스트

- MCP 서버가 `search_schools`, `get_lunch_meals` 도구를 등록하는지 확인한다.
- stdio MCP 클라이언트가 서버에 연결하여 도구 목록을 조회하는지 확인한다.
- 도구 호출이 NEIS 요청 파라미터, 중식 필터링, 빈 결과와 안전한 오류를
  올바르게 처리하는지 확인한다.

### 6.4 백엔드 통합 테스트

실제 HTTP 애플리케이션 경계에서 내부 학교 검색·급식 엔드포인트를
호출하고, 외부 NEIS 클라이언트를 모킹하여 다음을 검증한다.

- 요청 파라미터가 올바른 NEIS 경로와 필드(`MMEAL_SC_CODE=2` 포함)로
  전달되는지
- 정상 응답이 내부 JSON 계약으로 반환되는지
- 외부 오류와 빈 데이터가 정의된 상태 코드·응답 형식으로 변환되는지
- 입력 오류가 외부 API 호출 전에 차단되는지

### 6.5 E2E 테스트

Playwright 설정이 실제 Vite 프론트엔드와 FastAPI 백엔드를 별도 프로세스로
실행한 뒤 브라우저에서 전체 사용자 흐름을 검증한다. 브라우저 요청을
Playwright에서 가로채지 않으며, FastAPI의 `NEIS_BASE_URL`만 표준 라이브러리
기반 로컬 mock NEIS 서버로 지정한다. 이 서버는 고정 fixture와 요청
파라미터 검사를 제공하므로 외부 네트워크 없이 실제 프론트엔드-백엔드 HTTP
경계를 결정적으로 통과한다.

1. 부분 학교명을 검색한다.
2. 학교를 선택한다.
3. 시작일과 종료일을 선택한다.
4. 조회를 실행한다.
5. 날짜별 중식 메뉴를 확인한다.

검색 결과 없음, 잘못된 날짜 범위, 급식 정보 없음 및 서버 오류에 대한
사용자 안내도 E2E 시나리오로 포함한다. E2E 환경의 외부 NEIS 호출은
결정적인 테스트를 위해 테스트 서버나 모킹 계층으로 대체한다.

## 7. 보안 및 운영 고려사항

- NEIS 인증키는 백엔드와 MCP 서버의 환경 변수 또는 비밀 저장소로만 관리한다.
  Azure에서는 Key Vault secret을 각 Container App의 관리 ID로 읽는다.
- CORS는 허용된 프론트엔드 출처로 제한한다.
- 학교명과 코드 같은 사용자 입력은 길이·문자 형식·허용 범위를
  검증하고 로그에 원문을 불필요하게 남기지 않는다.
- 외부 API 타임아웃, 연결 오류, 응답 형식 오류를 구분하여 처리한다.
- 외부 API 호출에는 무제한 재시도를 적용하지 않으며, 필요할 경우
  제한된 횟수와 백오프 정책을 별도로 설정한다.
- 헬스체크는 애플리케이션 프로세스 상태를 확인하되 인증키를 반환하지
  않는다.

## 8. 구현 제약과 변경 관리

- 실제 구현 시 기존 `src/openapi.json`의 경로, 파라미터, 응답 필드를
  기준으로 하며 공개 계약을 임의로 수정하지 않는다.
- 프론트엔드와 백엔드의 디렉터리 및 프레임워크 세부 구조는 각 매니페스트와
  프로젝트 규칙에 맞춰 결정한다.
- 구현과 문서가 달라지지 않도록 내부 API, 실행 방식 및 테스트 전략 변경 시
  이 문서를 함께 갱신한다.
