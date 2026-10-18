---
name: dependabot-fix
description: Dependabot 관제탑에서 사람이 "수정 필요"로 분류한 Dependabot PR을 골라 실패한 CI를 최소 수정하고 Draft PR로 올린다. "수정 필요 PR 고쳐 줘", "Dependabot 수정 Draft PR" 요청이나 수정 Automation에서 사용한다.
---

# Dependabot 수정 Draft PR

사람이 관제탑에서 **수정 필요**로 옮긴 Dependabot PR만 처리한다. 무엇을 고칠지는 사람이 정하고, 이 skill은 정해진 PR의 실패한 CI를 고쳐 Draft PR까지만 만든다.

## 규칙

- **대상은 관제탑의 "수정 필요" 칸뿐이다.** 다른 PR을 스스로 고르지 않는다. 대상이 없으면 "수정 필요로 분류된 PR이 없습니다"라고 보고하고 끝낸다.
- **Draft PR까지만 만든다.** 어떤 PR도 머지·승인·닫기·ready for review로 바꾸지 않는다. Dependabot 브랜치에 push하지 않는다.
- **최소 수정만 한다.** 실패 원인과 관련된 코드와 테스트만 고친다. 다른 의존성을 올리거나 관련 없는 정리를 하지 않는다.
- **멈출 줄 안다.** 원인이 불분명하거나, 수정 후 테스트가 실패하거나, `AGENTS.md`의 규칙(예: 고정된 의존성 범위)과 충돌하는 수정이 필요하면 PR을 만들지 않고 이유를 보고한다.
- **비밀 값을 옮기지 않는다.** `.env`, 토큰, Azure 변수 값이 로그에 보여도 커밋·PR 본문·보고에 넣지 않는다.
- 관제탑 상태 파일은 읽기만 한다.
- 한 번에 최대 3개 PR까지 처리한다.

## 순서

1. 저장소 이름과 기본 브랜치를 확인한다.

   ```sh
   gh repo view --json nameWithOwner,defaultBranchRef
   ```

2. 관제탑 상태 파일에서 "수정 필요" PR을 읽는다.
   - 위치: `$COPILOT_HOME/extensions/dependabot-board/artifacts/state.json`. `COPILOT_HOME`이 없으면 `~/.copilot` (Windows는 `%USERPROFILE%\.copilot`).
   - 형식: `repos["owner/repo"].prs["81"] = { "column": "fix", "reason": "...", "updatedAt": "..." }`
   - `column`이 `"fix"`인 PR 번호를 `updatedAt`이 오래된 순으로 고른다. `reason`은 수정 방향의 힌트로 쓴다.
   - 파일이 없거나 읽을 수 없으면 추측하지 말고 "관제탑 분류 결과를 찾지 못했습니다"라고 보고하고 끝낸다.

3. PR마다 건너뛸지 확인한다. 하나라도 해당하면 그 PR은 건너뛰고 이유를 적는다.
   - PR이 열려 있지 않다.
   - 모든 체크가 통과했다.
   - 제목이나 본문에 `#번호`를 언급하는 열린 PR(Dependabot이 아닌)이 이미 있다.

   ```sh
   gh pr view <PR> --json state,headRefName,title,statusCheckRollup,url
   gh pr list --state open --search "<PR> in:body,title" --json number,title,url,author
   ```

4. 실패 원인을 확인한다. 오류를 보여 주는 한 줄만 기록한다.

   ```sh
   gh pr checks <PR> --json name,state,link
   gh run view <RUN_ID> --log-failed
   ```

5. Dependabot 브랜치를 기반으로 새 브랜치를 만들어 수정한다. 의존성 업데이트와 수정이 함께 들어가야 CI가 통과하기 때문이다.

   ```sh
   git fetch origin <headRefName>
   git switch -c fix/dependabot-<PR> origin/<headRefName>
   ```

6. 실패한 job에 해당하는 검사를 `AGENTS.md`의 명령으로 실행한다. 예: Python job이면 `src/backend` 또는 `src/mcp`에서 `uv run --extra dev pytest`, TypeScript job이면 `src/frontend`에서 `npm run build && npm test`. 실패하면 PR을 만들지 않는다.

7. Conventional Commits 형식으로 커밋하고 새 브랜치를 push한 뒤 기본 브랜치를 대상으로 **Draft** PR을 만든다. `.github/PULL_REQUEST_TEMPLATE.md`를 따르고, 본문 첫 줄에 `Refs #<PR>`을 적는다. 그래야 관제탑 카드에 수정 PR로 연결된다.

   ```sh
   gh pr create --draft --base <defaultBranch> --head fix/dependabot-<PR> \
     --title "fix: <패키지> <버전> 호환성 수정" --body-file <본문 파일>
   ```

   - Dependabot PR이 먼저 머지되거나 닫히면 이 Draft PR과 겹칠 수 있다는 점을 "알려진 제한 사항"에 적는다.

## 보고 형식

```markdown
## Dependabot 수정 결과 (YYYY-MM-DD)

| PR | 결과 | 근거 |
|---|---|---|
| [#81](URL) | Draft PR [#90](URL) 생성 | `오류 한 줄` → 수정 내용 한 줄 |
| [#79](URL) | 건너뜀 | 이미 [#88](URL)이 #79를 언급 |
| [#77](URL) | 멈춤 | 수정 후 `pytest` 실패: `오류 한 줄` |
```
