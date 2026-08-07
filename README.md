# 급식배틀: 초중고 급식 메뉴 조회 및 분석 앱

NEIS 공개 API를 활용한 초중고 급식 메뉴 조회 및 분석 웹 애플리케이션입니다.

## 주요 기능

- 학교 이름의 일부로 학교를 검색합니다.
- 학교와 조회할 날짜 범위를 선택합니다.
- 날짜별 중식 메뉴와 조회 결과 없음 또는 API 오류 상태를 표시합니다.
- 브라우저에서 NEIS API를 직접 호출하지 않고 Python API를 통해 연동합니다.
- React 프론트엔드와 Python 백엔드를 Docker Compose로 함께 실행합니다.

## 아키텍처

| 구성 요소 | 기술 | 역할 |
| --- | --- | --- |
| 프론트엔드 | React 및 TypeScript | 학교 검색, 날짜 선택 및 급식 메뉴 표시 |
| 백엔드 | Python | NEIS API 연동, 입력값 검증 및 응답 데이터 구성 |
| 실행 환경 | Docker Compose | 프론트엔드와 백엔드의 로컬 오케스트레이션 |

예정된 소스 디렉터리 구조는 다음과 같습니다.

```text
src/frontend/ React 및 TypeScript 애플리케이션
src/backend/  Python API 애플리케이션
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
```

## 애플리케이션 실행

전체 애플리케이션을 빌드하고 실행합니다.

```sh
docker compose up --build
```

브라우저는 `http://localhost:5173`, API는 `http://localhost:8000`에서
접속합니다. `.env.example`을 `.env`로 복사하고 NEIS API 키를 설정하세요.

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

프론트엔드와 백엔드 테스트를 한 번에 실행하려면 다음 스크립트를 사용합니다.

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

## 기여하기

개발 환경 설정 및 Pull Request 안내는
[CONTRIBUTING.md](CONTRIBUTING.md)를 참고하세요.

## 보안

취약점을 비공개로 신고하려면 [SECURITY.md](SECURITY.md)를 참고하세요.

## 라이선스

이 프로젝트는 [MIT 라이선스](LICENSE)를 따릅니다.
