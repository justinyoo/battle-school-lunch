# 밋업 데모 준비물

밋업 세션 "Copilot app의 알려지지 않은 기능 두 가지: Canvas와 Automation"에서 쓰는 데모 자료입니다. 앱 동작에는 영향을 주지 않습니다.

## 발표 슬라이드 (Marp)

| 파일 | 용도 |
|---|---|
| `meetup-deck.md` | 슬라이드 원본(21장). 슬라이드별 진행 메모와 마지막 CTA의 시작 링크 포함 |
| `meetup-deck.html` | 발표용 내보내기. `backgrounds/`와 같은 위치에 두고 열기 |
| `backgrounds/` | 슬라이드 배경 이미지(칠판, 모눈종이, Canvas·Automation 대비) |
| `assets/icon-linkedin.png` | 표지에 표시하는 LinkedIn 아이콘 |

- 폰트 "배민 을지로체"와 Font Awesome Free 아이콘은 CDN에서 불러오므로 발표 중 인터넷이 필요합니다. 오프라인이면 폰트를 로컬에 설치하고 Font Awesome 아이콘을 로컬에 준비해야 합니다. 을지로체에는 문장부호가 없어 `?`, `,`, 따옴표 등은 "배민 주아체"로 채웁니다.

### 실행

저장소 루트에서 `demo`로 이동한 뒤 실행합니다.

```sh
cd demo

# 발표: 내보낸 HTML을 기본 브라우저로 열기 (Windows. macOS는 open, Linux는 xdg-open)
start meetup-deck.html

# 리허설·수정: Marp 미리보기 창으로 열기. 원본을 고치면 바로 반영
npx -y @marp-team/marp-cli@4.5.1 -p meetup-deck.md

# 원본을 고친 뒤 발표용 HTML 다시 내보내기
npx -y @marp-team/marp-cli@4.5.1 meetup-deck.md -o meetup-deck.html
```

발표 중 쓰는 키:

| 키 | 동작 |
|---|---|
| `f` / `F11` | 전체 화면 |
| `p` | 발표자 보기를 새 창으로 엶. 진행 메모와 경과 시간이 보임 |
| `o` / `Esc` | 전체 슬라이드 보기 |
| `←` / `→` | 이전 / 다음 슬라이드 |

## 루브릭 시뮬레이터 (Excel Canvas)

| 파일 | 용도 |
|---|---|
| `rubric-simulator.xlsx` | 기본 가중치(35/25/25/15)로 시작하는 점수표. 노란 셀에 학교 이름, 현재 가중치, 영역별 점수(1~5)를 입력 |
| `rubric-simulator-flipped.xlsx` | 영양·건강성 가중치를 50으로 바꿔 승자가 뒤집힌 백업 |

## Dependabot 아침 브리핑 (Automation)

브리핑 지시는 [`.github/skills/dependabot-briefing/SKILL.md`](../.github/skills/dependabot-briefing/SKILL.md)에 있습니다. Automation 자체는 저장소에 저장되지 않으므로, 아래 링크로 생성 화면을 미리 채워 엽니다.

[**Copilot app에서 Automation 만들기**](https://github.com/copilot/app/launch?open=ghapp%3A%2F%2Fautomations%2Fnew%3Fname%3DDependabot%2520%25EC%2595%2584%25EC%25B9%25A8%2520%25EB%25B8%258C%25EB%25A6%25AC%25ED%2595%2591%26trigger%3Ddaily%26time%3D09%253A00%26prompt%3D%252Fdependabot-briefing%2520%25EC%2597%25B4%25EB%25A6%25B0%2520Dependabot%2520PR%25EC%259D%2584%2520%25ED%259B%2591%25EC%2596%25B4%25EB%25B3%25B4%25EA%25B3%25A0%2520%25EC%2598%25A4%25EB%258A%2598%2520%25EB%25B3%25BC%25203%25EA%25B0%2580%25EC%25A7%2580%25EB%25A5%25BC%2520%25EA%25B3%25A8%25EB%259D%25BC%2520%25EC%25A4%2598)

| 항목 | 미리 채워지는 값 |
|---|---|
| 이름 | Dependabot 아침 브리핑 |
| 일정 | 매일 09:00 |
| 프롬프트 | `/dependabot-briefing 열린 Dependabot PR을 훑어보고 오늘 볼 3가지를 골라 줘` |

- 링크를 눌러도 바로 만들어지지 않습니다. 화면에서 프로젝트를 고르고 **Create**를 눌러야 저장됩니다.
- Automation은 실행할 때마다 기본 브랜치에서 새 세션을 열기 때문에, skill이 기본 브랜치에 있어야 `/dependabot-briefing`을 찾습니다.

### Automation ②: "수정 필요" PR을 Draft PR로

수정 지시는 [`.github/skills/dependabot-fix/SKILL.md`](../.github/skills/dependabot-fix/SKILL.md)에 있습니다. PR 번호를 프롬프트에 박지 않고, 사람이 관제탑에서 **수정 필요**로 옮긴 PR을 실행할 때마다 읽어 처리합니다. 사람은 고칠 것을 고르고, Automation은 고쳐서 Draft PR까지만 올립니다.

[**Copilot app에서 Automation ② 만들기**](https://github.com/copilot/app/launch?open=ghapp%3A%2F%2Fautomations%2Fnew%3Fname%3DDependabot%2520%25EC%2588%2598%25EC%25A0%2595%2520Draft%2520PR%26trigger%3Ddaily%26time%3D10%253A00%26prompt%3D%252Fdependabot-fix%2520%25EA%25B4%2580%25EC%25A0%259C%25ED%2583%2591%25EC%2597%2590%25EC%2584%259C%2520%25EC%2588%2598%25EC%25A0%2595%2520%25ED%2595%2584%25EC%259A%2594%25EB%25A1%259C%2520%25EB%25B6%2584%25EB%25A5%2598%25EB%2590%259C%2520Dependabot%2520PR%25EC%259D%2584%2520%25EA%25B3%25A0%25EC%25B3%2590%25EC%2584%259C%2520Draft%2520PR%25EB%25A1%259C%2520%25EC%2598%25AC%25EB%25A0%25A4%2520%25EC%25A4%2598)

| 항목 | 미리 채워지는 값 |
|---|---|
| 이름 | Dependabot 수정 Draft PR |
| 일정 | 매일 10:00 (브리핑 09:00 → 사람이 분류 → 10:00 수정) |
| 프롬프트 | `/dependabot-fix 관제탑에서 수정 필요로 분류된 Dependabot PR을 고쳐서 Draft PR로 올려 줘` |
| 동작 | "수정 필요" PR마다 CI 실패 조사 → 최소 수정과 테스트 → 본문에 `Refs #번호`가 있는 Draft PR. 닫힌 PR, 통과한 PR, 이미 수정 PR이 있는 PR은 건너뜀 |

- 링크는 로그인한 다른 디바이스에서도 열 수 있습니다. 링크를 연 뒤 프로젝트로 `justinyoo/battle-school-lunch`를 선택하고 내용을 확인한 다음 **Create**를 눌러 저장하세요.
- Automation은 저장소에 저장되는 파일이 아닙니다. 새 디바이스에서도 쓰려면 링크를 열어 그 디바이스/계정에서 Automation을 만들어야 합니다.
- 무대에서는 10:00을 기다리지 않고 Automations 화면에서 바로 실행합니다.
- 관제탑 분류 결과는 사용자별 파일이라 **같은 디바이스·계정**에서 분류해야 Automation이 읽습니다.

## Dependabot 관제탑 (커스텀 Canvas)

[`.github/extensions/dependabot-board/`](../.github/extensions/dependabot-board/)에 있는 프로젝트 확장입니다. 이 저장소에서 세션을 열면 Copilot app이 자동으로 불러오고, 채팅에서 "Dependabot 관제탑 열어 줘"라고 하면 Canvas로 열립니다. `gh`가 로그인되어 있어야 합니다.

| 영역 | 보이는 것 |
|---|---|
| 상단 | 저장소, 열린 PR 수, CI 실패 수, 갱신 시각, **새로고침**, **초기화**(두 번 눌러야 실행) |
| 아침 브리핑 | 브리핑 skill이 남긴 "오늘 볼 3가지". 없으면 안내 문구 |
| 칸 | **미분류** · **바로 머지** · **수정 필요** · **보류**. 카드를 끌어 놓거나 카드의 이동 버튼으로 옮김 |
| 카드 | 생태계, 패키지, 버전 변화, CI 실패 job 링크(앱 안 Browser Canvas로 열림), "오늘 ①" 표시, 대체된 PR, 판단 근거, 연결된 수정 PR |
| 카드 버튼 | 마우스를 올리면 **Copilot에게 맡기기**와 이동 버튼이 보임 |

**Copilot에게 맡기기**를 누르면 현재 채팅에 분류 요청이 들어갑니다. Copilot이 CI 로그를 읽기 전용으로 확인하고 `set_verdict`로 카드를 옮기며 근거를 남깁니다. 그동안 카드에는 "Copilot이 확인하는 중…"이 표시됩니다.

카드의 CI 실패 job 링크를 그냥 클릭하면 앱 안의 Browser Canvas(`dependabot-board-link` 패널)에서 로그가 열립니다. 같은 패널을 계속 재사용하므로 한 번 로그인해 두면 이후 로그도 로그인된 상태로 보입니다. Ctrl/Shift/가운데 클릭은 외부 브라우저로 엽니다. 채팅에서 "#81 CI 로그 앱 안에서 열어 줘"라고 해도 같은 패널에서 열립니다.

### 무대 진행

| 슬라이드 | 할 일 |
|---|---|
| 14 | 관제탑을 열고 브리핑 ①인 **#81** 카드에서 **Copilot에게 맡기기** → 채팅에서 로그 확인 과정 → 카드가 **수정 필요**로 이동하고 근거 표시 |
| 15 | PR Canvas로 #81을 열어 diff를 봅니다. PR Canvas의 CI 링크는 외부 브라우저로 열리므로, 로그는 관제탑 #81 카드의 **Python** 실패 링크를 클릭하거나 "#81 CI 로그 앱 안에서 열어 줘"라고 해서 앱 안에서 엽니다 |
| 16 | 14에서 #81이 **수정 필요**에 있는 상태로 Automation ②를 바로 실행. PR 번호를 알려 주지 않아도 관제탑 분류를 읽어 #81을 고른다는 점을 짚습니다. 끝나면 Draft PR이 #81 카드에 "수정 PR #번호 (Draft)"로 표시되는지 확인합니다. 안 보이면 **새로고침** |
| 17 | "major 업데이트에 빨간 배지 달아 줘" → Copilot이 `renderer.mjs`를 고치고 확장을 다시 불러오면 major 카드에 **MAJOR** 배지 |

### 준비할 것

- **확장과 skill이 기본 브랜치에 있어야 합니다.** 새 세션과 Automation은 기본 브랜치에서 시작합니다.
- **분류 상태는 사용자별로 저장됩니다** (`~/.copilot/extensions/dependabot-board/artifacts/state.json`). 모든 세션과 Automation ②가 같은 파일을 봅니다. 리허설 뒤에는 **초기화**를 두 번 누르거나 "관제탑 초기화해 줘"라고 해서 빈 보드로 되돌립니다. 그러지 않으면 Automation ②가 리허설 때 분류한 PR을 다시 처리하려고 합니다.
- **CI 로그 패널 로그인:** 저장소가 비공개라 로그인하지 않은 Browser Canvas에서는 로그가 404로 보입니다. 발표 직전에 관제탑 카드의 CI 링크를 한 번 클릭하고, 열린 패널에서 GitHub에 로그인한 뒤 **그 패널을 닫지 마세요.** 로그인은 패널 단위로 유지되며, 패널을 닫았다가 다시 열면 로그아웃된 상태로 열립니다.
- **브리핑 연동:** 브리핑 skill이 자기 세션 폴더에 `files/dependabot-board/briefing.json`을 남기면, 관제탑이 모든 세션 폴더에서 가장 최근 파일을 찾아 보여 줍니다. 발표 전에 브리핑 Automation을 한 번 실행해 두세요.
- **Draft PR 연결:** Dependabot이 아닌 열린 PR의 제목이나 본문에 `#81`이 있으면 자동으로 연결됩니다. `dependabot-fix` skill이 본문 첫 줄에 `Refs #81`을 적습니다. 직접 연결하려면 "#81 카드에 <PR URL> 연결해 줘"라고 합니다.

### 슬라이드 17 백업

라이브 수정이 막히면 미리 만든 패치를 적용하고 확장을 다시 불러옵니다.

```sh
git apply demo/patches/major-badge.patch
```

적용 후 채팅에서 "확장 다시 불러와 줘"라고 하면 배지가 보입니다. 발표 뒤에는 `git apply -R demo/patches/major-badge.patch`로 되돌립니다.

### Copilot이 쓰는 동작

| 동작 | 설명 |
|---|---|
| `get_board` | 카드 전체 또는 한 칸의 카드 목록 |
| `refresh` | GitHub에서 PR, CI, 수정 PR, 최신 브리핑을 다시 읽음 |
| `set_verdict` | 카드를 칸으로 옮기고 근거를 남김 (`pr`, `column`, `reason`, 선택 `fixPr`) |
| `link_fix_pr` | 카드에 수정 PR URL 연결 |
| `open_ci_log` | PR의 실패한 CI job 로그를 앱 안 Browser Canvas로 엶 (`pr`, 선택 `check`) |
| `reset_board` | 모든 카드를 미분류로 되돌림. 사용자가 요청할 때만 사용 |
