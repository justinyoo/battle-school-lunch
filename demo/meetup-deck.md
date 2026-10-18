---
marp: true
theme: default
size: 16:9
paginate: true
title: Copilot app의 알려지지 않은 기능 두 가지 - Canvas와 Automation
---

<style>
@import url('https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.7.2/css/all.min.css');

@font-face {
  font-family: 'BMEULJIRO';
  src: local('BM EULJIRO'), local('배민 을지로체'),
    url('https://fastly.jsdelivr.net/gh/projectnoonnu/noonfonts_twelve@1.0/BMEULJIRO.woff') format('woff');
  font-display: block;
}

/* 을지로체에는 문장부호·기호 글리프가 없어 같은 배민 계열인 주아체로 채움 */
@font-face {
  font-family: 'BMEULJIRO';
  src: local('BM JUA'), local('배민 주아체'),
    url('https://fastly.jsdelivr.net/gh/projectnoonnu/noonfonts_one@1.0/BMJUA.woff') format('woff');
  unicode-range: U+21-2F, U+3A-40, U+5B-60, U+7B-7E, U+2018-2019, U+201C-201D, U+2026;
  font-display: block;
}

:root {
  --ink: #111111;
  --paper: #f7f2e4;
  --white: #ffffff;
  --yellow: #ffd400;
  --orange: #ff5a1f;
  --navy: #1f2f98;
  --line: 5px;
  --shadow: 8px 8px 0 var(--ink);
}

section {
  font-family: 'BMEULJIRO', 'BM JUA', sans-serif;
  font-weight: normal;
  font-synthesis: none;
  font-size: 34px;
  line-height: 1.35;
  letter-spacing: 0;
  word-break: keep-all;
  overflow-wrap: break-word;
  color: var(--ink);
  background: var(--paper);
  padding: 80px 130px 80px 150px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
}

section h1,
section h2,
section h3,
section strong {
  font-family: inherit;
  font-weight: normal;
  border: none;
  margin: 0;
  padding: 0;
  color: inherit;
}

section p {
  margin: 0;
}

/* Grid-paper content slides */
section h2 {
  display: inline-block;
  font-size: 60px;
  line-height: 1.1;
  background: var(--yellow);
  border: var(--line) solid var(--ink);
  box-shadow: var(--shadow);
  padding: 16px 28px 10px;
  margin-bottom: 44px;
}

section h3 {
  display: inline-block;
  font-size: 30px;
  background: var(--ink);
  color: var(--yellow);
  padding: 8px 18px 4px;
  margin: -22px 0 36px 28px;
}

section ul,
section ol {
  list-style: none;
  padding: 0;
  margin: 0;
  width: 100%;
  max-width: 880px;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

section li {
  background: var(--white);
  border: 4px solid var(--ink);
  box-shadow: 6px 6px 0 var(--ink);
  padding: 14px 24px 10px;
}

section li + li {
  margin: 0;
}

section li strong {
  background: var(--orange);
  color: var(--white);
  border: 3px solid var(--ink);
  padding: 0 10px;
  margin-right: 6px;
}

section a {
  color: inherit;
  text-decoration: none;
}

section .sep {
  display: inline-block;
  width: 0.28em;
  height: 0.28em;
  background: currentColor;
  margin: 0 0.45em;
  vertical-align: 0.2em;
}

section .nowrap {
  white-space: nowrap;
}

section .fa-arrow-right {
  font-size: 0.82em;
  margin: 0 0.15em;
  vertical-align: 0.04em;
}

section .fa-arrow-up-right-from-square {
  font-size: 0.72em;
  margin-left: 0.2em;
  vertical-align: 0.08em;
}

section::after {
  font-family: inherit;
  font-size: 22px;
  color: var(--ink);
  background: var(--yellow);
  border: 3px solid var(--ink);
  box-shadow: 4px 4px 0 var(--ink);
  padding: 6px 12px 2px;
  left: 44px;
  right: auto;
  bottom: 30px;
}

/* Slide 2: one big question */
section.ask {
  align-items: center;
  text-align: center;
}

section.ask h1 {
  max-width: 960px;
  font-size: 92px;
  line-height: 1.15;
  background: var(--yellow);
  border: 6px solid var(--ink);
  box-shadow: 16px 16px 0 var(--ink);
  padding: 34px 50px 24px;
  transform: rotate(-2deg);
}

/* Last item stands out */
section.punch li:last-child {
  background: var(--yellow);
  font-size: 40px;
  transform: rotate(-1deg);
}

section.punch li:last-child strong {
  background: var(--ink);
  color: var(--yellow);
}

/* Slide 9: rubric */
section.rubric li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px 10px 26px;
}

section.rubric li strong {
  font-size: 44px;
  line-height: 1;
  min-width: 96px;
  text-align: center;
  background: var(--ink);
  color: var(--yellow);
  padding: 10px 14px 4px;
  margin: 0;
}

section.rubric li:first-child strong {
  background: var(--orange);
  color: var(--white);
}

section.rubric > p,
section.numbers > p {
  font-size: 22px;
  background: var(--ink);
  color: var(--white);
  padding: 6px 14px 2px;
  margin-top: 34px;
}

/* Slide 11: big numbers */
section.numbers ul {
  flex-direction: row;
  gap: 34px;
  max-width: none;
}

section.numbers li {
  flex: 1;
  display: flex;
  flex-direction: column;
  font-size: 28px;
  padding: 18px 24px 16px;
}

section.numbers li strong {
  font-size: 150px;
  line-height: 1;
  background: none;
  border: none;
  padding: 0;
  margin: 0 0 12px;
  color: var(--orange);
  text-shadow: 6px 6px 0 var(--ink);
}

section.numbers li:nth-child(2) strong {
  color: var(--yellow);
}

section.numbers li:nth-child(3) strong {
  color: var(--navy);
}

/* Slide 19: numbered rules */
section.rules ol {
  counter-reset: rule;
}

section.rules li {
  counter-increment: rule;
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 8px 24px 8px 8px;
}

section.rules li::before {
  content: counter(rule, decimal-leading-zero);
  font-size: 30px;
  background: var(--ink);
  color: var(--yellow);
  padding: 8px 14px 4px;
}

/* Chalkboard slides */
section.demo,
section.cover,
section.finale {
  color: var(--white);
  align-items: center;
  text-align: center;
  padding: 80px 170px;
}

section.demo::after,
section.cover::after,
section.finale::after,
section.duo::after {
  display: none;
}

section.demo h1 {
  font-size: 84px;
  line-height: 1.15;
  text-shadow: 6px 6px 0 var(--ink);
  margin-bottom: 40px;
}

section.demo h1::before {
  content: "DEMO";
  display: block;
  width: max-content;
  margin: 0 auto 30px;
  font-size: 34px;
  letter-spacing: 6px;
  color: var(--ink);
  text-shadow: none;
  background: var(--yellow);
  border: var(--line) solid var(--ink);
  box-shadow: 6px 6px 0 var(--ink);
  padding: 10px 24px 4px 30px;
  transform: rotate(-4deg);
}

section.demo p {
  font-size: 30px;
  color: var(--ink);
  background: var(--white);
  border: 4px solid var(--ink);
  box-shadow: 6px 6px 0 var(--ink);
  padding: 12px 24px 8px;
}

section.demo p + p {
  margin-top: 24px;
}

section.demo p:has(a) {
  font-size: 26px;
  background: var(--orange);
  color: var(--white);
  transform: rotate(1.5deg);
}

section.cover h2 {
  font-size: 40px;
  color: var(--ink);
  background: var(--white);
  margin-bottom: 26px;
  transform: rotate(-1.5deg);
}

section.cover h1 {
  font-size: 104px;
  line-height: 1.1;
  color: var(--yellow);
  text-shadow: 7px 7px 0 var(--ink);
  margin-bottom: 30px;
}

section.cover p {
  font-size: 32px;
}

section.cover p:nth-of-type(1) {
  color: var(--ink);
  background: var(--orange);
  border: 4px solid var(--ink);
  box-shadow: 6px 6px 0 var(--ink);
  padding: 8px 20px 4px;
  transform: rotate(2deg);
  margin-bottom: 30px;
}

section.cover p:nth-of-type(3) {
  font-size: 22px;
  margin-top: 26px;
  opacity: 0.85;
}

section.cover .linkedin-icon {
  width: 26px;
  height: 26px;
  vertical-align: -5px;
  margin: 0 4px;
}

section.finale h1 {
  font-size: 88px;
  line-height: 1.15;
  color: var(--ink);
  background: var(--yellow);
  border: 6px solid var(--ink);
  box-shadow: 14px 14px 0 var(--ink);
  padding: 28px 44px 20px;
  transform: rotate(-2deg);
  margin-bottom: 44px;
}

section.finale p {
  font-size: 32px;
}

section.finale p:last-of-type {
  font-size: 40px;
  color: var(--ink);
  background: var(--white);
  border: 4px solid var(--ink);
  box-shadow: 6px 6px 0 var(--ink);
  padding: 10px 26px 6px;
  margin-top: 36px;
}

/* Touch vs. delegate slides */
section.duo {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto 1fr auto;
  column-gap: 120px;
  align-items: start;
  padding: 70px 60px 60px;
}

section.duo blockquote {
  margin: 0;
  color: var(--ink);
  background: var(--white);
  border: var(--line) solid var(--ink);
  box-shadow: 10px 10px 0 var(--ink);
  padding: 22px 30px 18px;
  font-size: 34px;
}

section.duo blockquote::before,
section.duo blockquote::after {
  content: none;
}

section.duo blockquote:nth-of-type(1) {
  grid-column: 1;
  grid-row: 1;
  transform: rotate(-1.5deg);
}

section.duo blockquote:nth-of-type(2) {
  grid-column: 2;
  grid-row: 1;
  transform: rotate(1.5deg);
}

section.duo blockquote strong {
  display: inline-block;
  font-size: 62px;
  line-height: 1.1;
  color: var(--white);
  border: 4px solid var(--ink);
  padding: 8px 18px 2px;
  margin-bottom: 10px;
}

section.duo blockquote:nth-of-type(1) strong {
  background: var(--orange);
}

section.duo blockquote:nth-of-type(2) strong {
  background: var(--navy);
}

section.duo > p {
  grid-column: 1 / span 2;
  grid-row: 3;
  justify-self: center;
  font-size: 44px;
  background: var(--yellow);
  border: var(--line) solid var(--ink);
  box-shadow: 10px 10px 0 var(--ink);
  padding: 14px 32px 8px;
}

section.duo > p strong {
  color: var(--orange);
}
</style>

<!-- _class: cover -->
<!-- _paginate: false -->

![bg](backgrounds/bg-b-chalkboard.png)

## Copilot app의 알려지지 않은 기능 두 가지

# Canvas와 Automation

(feat. 급식배틀 앱)

<!-- 만지고, 맡기고, 판단은 사람이 -->

commit/co | 2026-10-22

유저스틴 | 수석 디벨로퍼 아드보캇 | GitHub | <img class="linkedin-icon" src="assets/icon-linkedin.png" alt="LinkedIn"> [@justinyoo](https://linkedin.com/in/justinyoo)

---

<!-- _class: ask -->

![bg](backgrounds/bg-c-grid-note.png)

# AI에게 일을 시킬 때, 뭐가 불편했나요?

---

![bg](backgrounds/bg-c-grid-note.png)

## 자주 듣는 두 가지 불편

- 결과물이 채팅 밖에 있다 <i class="fa-solid fa-arrow-right" aria-hidden="true"></i> 화면을 계속 오간다
- 같은 일을 매번 시킨다 <i class="fa-solid fa-arrow-right" aria-hidden="true"></i> 내가 계속 붙어 있어야 한다

---

![bg](backgrounds/bg-c-grid-note.png)

## Canvas

### 같이 보며 고치는 화면

- 결과물을 AI와 같은 화면에 띄워 두고 함께 고치는 작업 공간
- **예** 웹 페이지, 표, 슬라이드, PR
- **언제** 눈으로 확인하며 여러 번 고쳐야 할 때

---

![bg](backgrounds/bg-c-grid-note.png)

## Automation

### 맡겨 두는 일

- 프롬프트와 일정을 저장해 두면 정해진 때 알아서 실행
- **예** 매일 아침 브리핑, 매주 문서 점검
- **언제** 반복되고, 결과는 나중에 봐도 될 때

---

<!-- _class: duo -->

![bg](backgrounds/bg-d-touch-delegate.png)

> **Canvas**
> 내가 화면 앞에 있을 때

> **Automation**
> 내가 자리에 없을 때

---

![bg](backgrounds/bg-c-grid-note.png)

## 오늘의 무대, 급식배틀

- 두 학교의 점심 급식을 비교하는 웹 앱
- 교육청 공개 급식 데이터 <i class="fa-solid fa-arrow-right" aria-hidden="true"></i> AI 에이전트 분석 <i class="fa-solid fa-arrow-right" aria-hidden="true"></i> 점수
- 오늘은 이 앱을 **한동안 돌보지 못한 상태**에서 다시 열어 봅니다

---

<!-- _class: demo -->

![bg](backgrounds/bg-b-chalkboard.png)

# 급식배틀 앱 둘러보기

Browser Canvas

---

<!-- _class: rubric -->

![bg](backgrounds/bg-c-grid-note.png)

## 급식은 어떻게 채점할까?

- 영양/건강성 **35**
- 식재료 품질/안전성 **25**
- 메뉴 다양성/기호도 **25**
- 지속가능성/가격 가치 **15**

영역별 5점 척도 <i class="fa-solid fa-arrow-right" aria-hidden="true"></i> 가중치로 환산해 100점 만점

---

<!-- _class: demo -->

![bg](backgrounds/bg-b-chalkboard.png)

# 가중치를 바꾸면 승자도 바뀔까?

Excel Canvas <span class="sep"></span> 여러분이 고른 학교 두 곳으로

---

<!-- _class: numbers -->

![bg](backgrounds/bg-c-grid-note.png)

## 두 달 만에 다시 열어 보니

- **20** 쌓인 의존성 업데이트 PR
- **4** 서로 다른 실패 원인
- **0** 8월 이후 main CI 실행 횟수

발표 준비 시점 기준

<!-- 발표 직전에 숫자를 다시 확인 (Dependabot 상태 고정 여부에 따라 바뀜) -->

---

<!-- _class: punch -->

![bg](backgrounds/bg-c-grid-note.png)

## 뭐부터 봐야 하지?

- 하나씩 열어 보면 반나절
- 그냥 다 머지하면 위험
- 오늘은 **맡기고, 같이 보고, 판단은 내가**

---

<!-- _class: demo -->

![bg](backgrounds/bg-b-chalkboard.png)

# 출근하면 준비된 브리핑

Automation <span class="sep"></span> 매일 오전 9시 <span class="sep"></span> PR 20개 중 오늘 볼 3개

[Automation 만들기 <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>](https://github.com/copilot/app/launch?open=ghapp%3A%2F%2Fautomations%2Fnew%3Fname%3DDependabot%2520%25EC%2595%2584%25EC%25B9%25A8%2520%25EB%25B8%258C%25EB%25A6%25AC%25ED%2595%2591%26trigger%3Ddaily%26time%3D09%253A00%26prompt%3D%252Fdependabot-briefing%2520%25EC%2597%25B4%25EB%25A6%25B0%2520Dependabot%2520PR%25EC%259D%2584%2520%25ED%259B%2591%25EC%2596%25B4%25EB%25B3%25B4%25EA%25B3%25A0%2520%25EC%2598%25A4%25EB%258A%2598%2520%25EB%25B3%25BC%25203%25EA%25B0%2580%25EC%25A7%2580%25EB%25A5%25BC%2520%25EA%25B3%25A8%25EB%259D%25BC%2520%25EC%25A4%2598)

<!--
① 링크를 눌러 채워진 생성 화면을 보여 주고 저장하지 않고 닫기 (30초)
② 미리 만들어 둔 Automation의 지난 실행 결과
③ ▶로 지금 실행
지시 내용은 저장소의 skill(/dependabot-briefing)에 있다는 점을 한 줄로 언급
-->

---

<!-- _class: demo -->

![bg](backgrounds/bg-b-chalkboard.png)

# 20개 PR, 한 화면에서 결정

Dependabot 관제탑 <span class="sep"></span> #81을 골라 "Copilot에게 맡기기"

<!-- 정체는 17번에서 공개하므로 "직접 만든", "커스텀"이라는 말을 쓰지 않음 -->

---

<!-- _class: demo -->

![bg](backgrounds/bg-b-chalkboard.png)

# #81은 왜 깨졌을까?

PR Canvas <span class="sep"></span> diff와 CI 로그로 근거 확인

<!-- PR Canvas의 CI 링크는 외부 브라우저로 열림. 로그는 관제탑 #81 카드의 Python 실패 링크를 클릭하거나 "#81 CI 로그 앱 안에서 열어 줘"로 앱 안 Browser Canvas에서 엶 -->

---

<!-- _class: demo -->

![bg](backgrounds/bg-b-chalkboard.png)

# 깨진 CI, 고친 PR까지

Automation <span class="sep"></span> 사람이 고르고, Automation이 고치고 <span class="nowrap"><span class="sep"></span> Draft PR까지만 만들고</span>

[Automation 만들기 <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>](https://github.com/copilot/app/launch?open=ghapp%3A%2F%2Fautomations%2Fnew%3Fname%3DDependabot%2520%25EC%2588%2598%25EC%25A0%2595%2520Draft%2520PR%26trigger%3Ddaily%26time%3D10%253A00%26prompt%3D%252Fdependabot-fix%2520%25EA%25B4%2580%25EC%25A0%259C%25ED%2583%2591%25EC%2597%2590%25EC%2584%259C%2520%25EC%2588%2598%25EC%25A0%2595%2520%25ED%2595%2584%25EC%259A%2594%25EB%25A1%259C%2520%25EB%25B6%2584%25EB%25A5%2598%25EB%2590%259C%2520Dependabot%2520PR%25EC%259D%2584%2520%25EA%25B3%25A0%25EC%25B3%2590%25EC%2584%259C%2520Draft%2520PR%25EB%25A1%259C%2520%25EC%2598%25AC%25EB%25A0%25A4%2520%25EC%25A4%2598)

<!--
① 링크를 눌러 채워진 생성 화면을 보여 주고 저장하지 않고 닫기 (30초)
② 14에서 #81을 "수정 필요"로 옮긴 상태로 미리 만들어 둔 Automation ②를 ▶로 바로 실행
프롬프트에 PR 번호가 없고 관제탑 분류를 읽는다는 점을 짚음
③ 끝나면 관제탑으로 돌아가 #81 카드에 붙은 Draft PR 링크를 보여 줌
-->

---

<!-- _class: demo -->

![bg](backgrounds/bg-b-chalkboard.png)

# 이 관제탑, 원래 없던 화면이에요

직접 만든 Canvas <span class="sep"></span> "major 업데이트에 빨간 배지 달아 줘"

<!-- 저장소에 넣어 둔 확장 하나로 동작해 클론한 팀원 모두 사용. 라이브로 고치고 reload해서 바로 반영. 막히면 git apply demo/patches/major-badge.patch 후 확장 reload -->

---

<!-- _class: duo -->

![bg](backgrounds/bg-d-touch-delegate.png)

> **Canvas**
> 화면 앞에서, 같이 보며 고칠 때
> 없으면 직접 만들어서

> **Automation**
> 자리 비운 사이, 반복되는 일

판단과 머지는 **사람이**

---

<!-- _class: rules -->

![bg](backgrounds/bg-c-grid-note.png)

## 맡길 때 정해 둔 규칙

1. Draft PR까지만 만들고 머지하지 않기
2. 같은 문제로 PR을 중복해서 만들지 않기
3. 결과에는 근거 링크를 반드시 붙이기
4. 비밀 값과 환경 변수는 화면과 결과에서 빼기

---

<!-- _class: finale -->
<!-- _paginate: false -->

![bg](backgrounds/bg-b-chalkboard.png)

# 내일 아침, 하나만 맡겨 보세요

매일 하는 일 중 하나를 Automation으로

감사합니다 <span class="sep"></span> Q&A
