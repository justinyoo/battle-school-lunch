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
- 워크플로우 실행 상태를 실시간으로 시각화하는 백엔드 통합 dev UI
  (`/dev/workflow`)를 추가했습니다.
- AG-UI 프로토콜 SSE 스트림(`POST /api/analysis/agui`)과 분석용 REST
  엔드포인트(`/api/schools/random`, `/api/analysis`,
  `/api/analysis/rubric`, `/api/analysis/workflow`,
  `/api/analysis/prompt`)를 추가했습니다.
- GitHub Copilot SDK 연동 설정(`AGENT_PROVIDER`, `COPILOT_MODEL`,
  `COPILOT_CLI_PATH`)을 추가했습니다. Copilot CLI나 자격
  증명이 없으면 외부 호출 없는 결정적 평가로 동작합니다.
- 리포지토리 관리 및 커뮤니티 운영을 위한 초기 파일을 추가했습니다.

### 변경

- 백엔드 CORS 허용 메서드에 `POST`를 추가하고 nginx `/api/` 프록시의
  버퍼링을 꺼 SSE 스트림이 지연 없이 전달되도록 했습니다.
