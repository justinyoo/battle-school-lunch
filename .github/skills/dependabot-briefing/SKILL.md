---
name: dependabot-briefing
description: 열린 Dependabot PR을 모두 훑어보고 CI 실패 원인을 분류한 뒤, 오늘 먼저 볼 PR 3가지를 근거 링크와 함께 고르는 아침 브리핑. "Dependabot 브리핑", "오늘 볼 PR", "의존성 PR 정리" 요청이나 아침 브리핑 Automation에서 사용한다.
---

# Dependabot 아침 브리핑

이 저장소의 열린 Dependabot PR을 읽기 전용으로 조사해 한국어 브리핑을 작성한다.

## 규칙

- **읽기만 한다.** PR을 머지·승인·닫기·댓글·라벨 변경하지 않고, 브랜치나 PR을 만들지 않으며, 코드를 수정하거나 push하지 않는다. 예외는 아래 "관제탑에 남기기"의 세션 폴더 파일 하나뿐이다.
- **모든 판단에 근거 링크를 붙인다.** PR URL과 실패한 job URL을 함께 적는다. 근거를 찾지 못하면 "확인 못 함"이라고 쓰고 추측하지 않는다.
- **비밀 값과 환경 변수를 결과에 넣지 않는다.** `.env` 내용, 토큰, Azure 변수 값, 시크릿 이름이 로그에 보여도 옮기지 않는다.
- 로그는 오류를 보여 주는 한 줄만 인용한다. 긴 로그를 붙이지 않는다.
- `gh` 명령이 실패하면 오류를 그대로 보고하고 멈춘다.

## 조사 순서

1. 열린 Dependabot PR과 CI 상태를 가져온다.

   ```sh
   gh pr list --author "app/dependabot" --state open --limit 100 \
     --json number,title,headRefName,labels,url,createdAt,statusCheckRollup
   ```

2. PR마다 다음을 정리한다.
   - 생태계: 브랜치 이름의 `dependabot/<pip|npm_and_yarn|github_actions>/...`
   - 패키지와 버전 변화: 제목에서 읽는다. major 변경인지 표시한다.
   - CI: 실패(`FAILURE`), 진행 중, 통과로 나눈다. 실패한 job 이름(`TypeScript`, `Python`, `MCP`, `Docker Compose`, `End-to-end`)을 적는다.
   - 같은 패키지를 다루는 PR이 여럿이면 오래된 쪽을 "대체됨"으로 표시한다.

3. 실패한 PR은 로그로 원인을 확인한다.

   ```sh
   gh pr checks <PR> --json name,state,link
   gh run view <RUN_ID> --log-failed
   ```

   원인을 다음 중 하나로 분류한다.
   - **호환성 깨짐:** 업데이트된 패키지의 API 변경으로 import·호출이 실패한다.
   - **의존성 충돌:** 설치 단계에서 버전 해석이 실패한다.
   - **변경과 무관해 보임:** 바뀐 패키지와 관계없는 영역의 테스트가 실패한다. main 자체 문제나 날짜·환경에 따라 결과가 바뀌는 테스트를 의심한다.
   - **E2E 실패:** 브라우저 E2E만 실패한다.

4. main CI의 최근 실행을 확인한다.

   ```sh
   gh run list --branch main --workflow CI --limit 3 --json conclusion,createdAt,url
   ```

## 오늘 볼 3가지를 고르는 기준

1. **호환성 깨짐** 중 영향이 가장 큰 PR 하나 (major 변경, 여러 테스트가 한꺼번에 깨지는 것 우선)
2. **변경과 무관해 보이는 실패** 하나 — main이 이미 깨졌을 가능성을 알린다
3. **바로 머지 후보 묶음** — 모든 체크가 통과했고 major 변경이 아닌 PR들을 한 항목으로 묶는다

해당하는 PR이 없는 기준은 건너뛰고 그 이유를 한 줄로 적는다.

## 출력 형식

```markdown
## Dependabot 아침 브리핑 (YYYY-MM-DD)

열린 PR N개 · CI 통과 a개 · 실패 b개 · 진행 중 c개 · main CI 마지막 실행: YYYY-MM-DD (결과)

### 오늘 볼 3가지
1. **[#번호](PR URL) 패키지 이전 → 이후 (major)** — 호환성 깨짐
   - 근거: `오류 한 줄` ([실패 job](job URL))
   - 제안: 코드 수정 필요
2. ...
3. **바로 머지 후보 묶음:** [#번호](URL), [#번호](URL) — 모두 통과, major 아님

### 나머지
| PR | 패키지 | 버전 변화 | CI | 분류 |
|---|---|---|---|---|
```

## 관제탑에 남기기

브리핑을 출력한 뒤, Dependabot 관제탑 Canvas가 읽을 수 있도록 고른 항목을 JSON으로 저장한다.

- 위치: 이 세션의 세션 폴더(시스템 안내의 Session folder) 아래 `files/dependabot-board/briefing.json`. 폴더가 없으면 만들고, 파일이 있으면 덮어쓴다. 저장소 안에는 쓰지 않는다.
- 세션 폴더를 알 수 없으면 저장하지 말고 브리핑 끝에 "관제탑에 남기지 못함"이라고 적는다.
- `repo`는 `gh repo view --json nameWithOwner`의 값, `generatedAt`은 지금 시각(ISO 8601)이다.
- `picks`는 "오늘 볼 3가지"를 순서대로 넣는다. `prs`는 PR 번호 배열, `category`는 분류(40자 이내), `summary`는 한 줄 근거(200자 이내)다. 비밀 값과 로그 원문은 넣지 않는다.

```json
{
  "version": 1,
  "repo": "owner/repo",
  "generatedAt": "2026-10-20T09:00:00+09:00",
  "picks": [
    { "rank": 1, "prs": [81], "category": "호환성 깨짐", "summary": "mcp 2.x에서 import 오류로 Python 테스트 실패" },
    { "rank": 2, "prs": [80], "category": "변경과 무관해 보임", "summary": "uvicorn 업데이트인데 TypeScript job이 실패" },
    { "rank": 3, "prs": [83, 68, 66], "category": "바로 머지 후보", "summary": "모두 통과, major 아님" }
  ]
}
```
