// Page served to the canvas iframe. Board data arrives over SSE (`events`);
// user actions POST to `api/*` with the per-instance request token.

const STYLE = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--background-color-default, Canvas);
  color: var(--text-color-default, CanvasText);
  font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", "Malgun Gothic", sans-serif);
  font-size: var(--text-body-medium, 14px);
  line-height: var(--leading-body-medium, 20px);
}
button { font: inherit; color: inherit; cursor: pointer; }
button:focus-visible, a:focus-visible { outline: 2px solid var(--color-focus-outline, Highlight); outline-offset: 2px; }
a { color: var(--true-color-blue, LinkText); text-decoration: none; }
a:hover { text-decoration: underline; }
.mono { font-family: var(--font-mono, ui-monospace, "SFMono-Regular", Consolas, monospace); }
.muted { color: var(--text-color-muted, GrayText); }
.app { display: flex; flex-direction: column; height: 100vh; }

header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 14px 16px 10px; }
h1 {
  margin: 0;
  font-size: var(--text-title-large, 22px);
  font-weight: var(--font-weight-semibold, 600);
  line-height: var(--leading-title-large, 28px);
}
.meta { margin-top: 2px; }
.toolbar { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }
.button {
  border: 1px solid var(--border-color-default, color-mix(in srgb, CanvasText 20%, transparent));
  background: transparent; border-radius: 6px; padding: 3px 10px;
}
.button:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
.button.danger { color: var(--true-color-red, #cf222e); }
.status { min-height: 20px; padding: 0 16px; }
.banner { margin: 0 16px 8px; padding: 8px 12px; border-radius: 6px; background: var(--true-color-red-muted, color-mix(in srgb, #cf222e 15%, transparent)); }

.briefing {
  margin: 0 16px 10px; padding: 8px 12px; border-radius: 8px;
  background: var(--true-color-blue-muted, color-mix(in srgb, #0969da 12%, transparent));
}
.briefing-title { font-weight: var(--font-weight-semibold, 600); margin-right: 8px; }
.briefing ol { margin: 4px 0 0; padding-left: 0; list-style: none; display: grid; gap: 2px; }
.briefing li .rank { font-weight: var(--font-weight-semibold, 600); margin-right: 4px; }

.board { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(4, minmax(210px, 1fr)); gap: 10px; padding: 0 16px 16px; overflow-x: auto; }
.column {
  display: flex; flex-direction: column; min-height: 0; border-radius: 8px;
  background: color-mix(in srgb, var(--text-color-default, CanvasText) 4%, transparent);
  border-top: 3px solid var(--column-color);
}
.column[data-column="inbox"] { --column-color: var(--true-color-blue, #0969da); }
.column[data-column="merge"] { --column-color: var(--true-color-green, #1a7f37); }
.column[data-column="fix"] { --column-color: var(--true-color-orange, #bc4c00); }
.column[data-column="hold"] { --column-color: var(--true-color-purple, #8250df); }
.column.drop-target { background: color-mix(in srgb, var(--column-color) 14%, transparent); }
.column-head { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px 6px; font-weight: var(--font-weight-semibold, 600); }
.count { font-weight: normal; padding: 0 8px; border-radius: 10px; background: color-mix(in srgb, currentColor 10%, transparent); }
.column-body { flex: 1; overflow-y: auto; padding: 0 8px 8px; display: grid; gap: 8px; align-content: start; }
.empty { padding: 12px 4px; text-align: center; }

.card {
  background: var(--background-color-default, Canvas);
  border: 1px solid var(--border-color-default, color-mix(in srgb, CanvasText 18%, transparent));
  border-radius: 8px; padding: 8px 10px; display: grid; gap: 3px;
}
.card.superseded { opacity: 0.6; }
.card.flash { animation: flash 2.4s ease-out; }
@keyframes flash {
  0%, 40% { box-shadow: 0 0 0 3px var(--true-color-blue, #0969da); }
  100% { box-shadow: 0 0 0 0 transparent; }
}
.card-top { display: flex; align-items: center; gap: 6px; }
.card-top .pr-link { margin-left: auto; }
.chip { font-size: 12px; padding: 0 6px; border-radius: 4px; background: color-mix(in srgb, currentColor 10%, transparent); }
.package { font-weight: var(--font-weight-semibold, 600); font-size: 15px; overflow-wrap: anywhere; }
.version { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.ci { display: flex; align-items: baseline; gap: 6px; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; transform: translateY(-1px); background: currentColor; }
.ci-failing .dot { background: var(--true-color-red, #cf222e); }
.ci-pending .dot { background: var(--true-color-yellow, #bf8700); }
.ci-passing .dot { background: var(--true-color-green, #1a7f37); }
.today {
  justify-self: start; font-size: 12px; padding: 0 8px; border-radius: 10px;
  background: var(--true-color-blue-muted, color-mix(in srgb, #0969da 15%, transparent));
}
.reason { padding: 4px 8px; border-radius: 6px; background: color-mix(in srgb, currentColor 6%, transparent); }
.reason-by { font-weight: var(--font-weight-semibold, 600); margin-right: 6px; }
.working { display: flex; align-items: center; gap: 6px; }
.spinner {
  width: 12px; height: 12px; border-radius: 50%;
  border: 2px solid color-mix(in srgb, currentColor 25%, transparent); border-top-color: currentColor;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.actions { display: none; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.card:hover .actions, .card:focus-within .actions { display: flex; }
.actions .primary {
  border: 0; border-radius: 6px; padding: 3px 10px;
  background: var(--true-color-blue, #0969da); color: var(--color-white, #fff);
}
.actions .move { border: 1px solid var(--border-color-default, color-mix(in srgb, CanvasText 20%, transparent)); background: transparent; border-radius: 6px; padding: 2px 8px; }
`;

const SCRIPT = `
const SHORT_LABELS = { inbox: "미분류", merge: "머지", fix: "수정", hold: "보류" };
const ECOSYSTEMS = { pip: "pip", npm_and_yarn: "npm", github_actions: "Actions", docker: "Docker" };
const RANKS = ["①", "②", "③", "④", "⑤"];
let board = null;
let connected = false;
let message = "";
let messageTimer = null;
let resetArmedUntil = 0;
const lastColumns = new Map();
const flashing = new Set();

function h(tag, props, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === "class") element.className = value;
    else if (key.startsWith("on")) element.addEventListener(key.slice(2), value);
    else element.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    element.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return element;
}

function link(url, label, className) {
  if (typeof url !== "string" || !url.startsWith("https://")) return h("span", { class: className }, label);
  return h("a", { href: url, target: "_blank", rel: "noopener noreferrer", class: className }, label);
}

// CI log links open in the app's Browser canvas; Ctrl/Cmd/middle click still uses the external browser.
function inAppLink(url, label, title) {
  const element = link(url, label);
  if (element.tagName !== "A") return element;
  element.title = "앱 안에서 열기";
  element.addEventListener("click", async (event) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    try { await post("api/open-link", { url, title }); }
    catch (error) { notify(error.message); }
  });
  return element;
}

function rank(value) { return RANKS[value - 1] || String(value); }

function formatTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  return date.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function notify(text) {
  message = text;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { message = ""; render(); }, 5000);
  render();
}

async function post(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-canvas-request-token": TOKEN },
    body: JSON.stringify(body || {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "요청이 실패했습니다.");
  return data;
}

async function move(pr, column) {
  try { await post("api/move", { pr, column }); }
  catch (error) { notify(error.message); }
}

async function delegate(pr) {
  try {
    await post("api/delegate", { pr });
    notify("#" + pr + "을(를) Copilot에게 맡겼어요. 채팅에서 진행 상황을 볼 수 있어요.");
  } catch (error) { notify(error.message); }
}

async function refresh() {
  try { await post("api/refresh"); notify("새로 불러왔어요."); }
  catch (error) { notify(error.message); }
}

async function reset() {
  if (Date.now() > resetArmedUntil) {
    resetArmedUntil = Date.now() + 4000;
    notify("한 번 더 누르면 모든 카드가 미분류로 돌아가요.");
    setTimeout(render, 4100);
    return;
  }
  resetArmedUntil = 0;
  try { await post("api/reset"); notify("분류를 초기화했어요."); }
  catch (error) { notify(error.message); }
}

function sortCards(cards, column) {
  return cards.slice().sort((a, b) => {
    if (column === "inbox") {
      const sa = a.supersededBy ? 1 : 0;
      const sb = b.supersededBy ? 1 : 0;
      if (sa !== sb) return sa - sb;
      const ra = a.briefing ? a.briefing.rank : 99;
      const rb = b.briefing ? b.briefing.rank : 99;
      if (ra !== rb) return ra - rb;
      const fa = a.ci.state === "failing" ? 0 : 1;
      const fb = b.ci.state === "failing" ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return b.number - a.number;
    }
    return String(b.decidedAt || "").localeCompare(String(a.decidedAt || ""));
  });
}

function renderHeader() {
  const cards = board ? board.cards : [];
  const failing = cards.filter((card) => card.ci.state === "failing").length;
  const meta = board && board.fetchedAt
    ? [board.repo, "열린 PR " + cards.length + "개", "CI 실패 " + failing + "개", formatTime(board.fetchedAt) + " 갱신"].join(" · ")
    : "PR 목록을 불러오는 중…";
  const armed = Date.now() < resetArmedUntil;
  return h("header", null,
    h("div", null, h("h1", null, "Dependabot 관제탑"), h("div", { class: "meta muted" }, meta)),
    h("div", { class: "toolbar" },
      board && board.loading ? h("span", { class: "spinner", title: "불러오는 중" }) : null,
      h("button", { class: "button", type: "button", onclick: refresh }, "새로고침"),
      h("button", { class: "button" + (armed ? " danger" : ""), type: "button", onclick: reset }, armed ? "정말 초기화" : "초기화")));
}

function renderStatus() {
  const text = message || (connected ? "" : "연결이 끊겼어요. 다시 연결하는 중…");
  return h("div", { class: "status muted", role: "status" }, text);
}

function renderBriefing() {
  if (!board || !board.fetchedAt) return null;
  const briefing = board.briefing;
  if (!briefing) {
    return h("section", { class: "briefing muted" }, "아침 브리핑 결과가 아직 없어요. 브리핑이 실행되면 오늘 볼 PR이 여기에 표시돼요.");
  }
  return h("section", { class: "briefing" },
    h("span", { class: "briefing-title" }, "아침 브리핑"),
    h("span", { class: "muted" }, formatTime(briefing.generatedAt)),
    h("ol", null, briefing.picks.map((pick) =>
      h("li", null,
        h("span", { class: "rank" }, rank(pick.rank)),
        pick.prs.map((number) => "#" + number).join(", "),
        pick.category ? " · " + pick.category : "",
        pick.summary ? h("span", { class: "muted" }, " — " + pick.summary) : null))));
}

function renderVersion(card) {
  if (!card.from || !card.to) return null;
  return h("div", { class: "version", title: (card.fromSpec || "") + " → " + (card.toSpec || "") },
    h("span", { class: "mono" }, card.from),
    "→",
    h("span", { class: "mono" }, card.to));
}

function renderCi(ci, number) {
  if (ci.state === "failing") {
    return h("div", { class: "ci ci-failing" }, h("span", { class: "dot" }),
      h("span", null, "CI 실패 · ", ci.failed.map((check, index) => [index ? ", " : "", inAppLink(check.url, check.name, "#" + number + " " + check.name + " 로그")])));
  }
  if (ci.state === "pending") return h("div", { class: "ci ci-pending" }, h("span", { class: "dot" }), "CI 진행 중");
  if (ci.state === "passing") return h("div", { class: "ci ci-passing" }, h("span", { class: "dot" }), "CI 통과");
  return h("div", { class: "ci muted" }, "CI 없음");
}

function renderActions(card) {
  const moves = board.columns
    .filter((column) => column.id !== card.column)
    .map((column) => h("button", {
      class: "move", type: "button", title: column.label + "(으)로 옮기기",
      onclick: () => move(card.number, column.id),
    }, "→ " + SHORT_LABELS[column.id]));
  return h("div", { class: "actions" },
    card.pending ? null : h("button", { class: "primary", type: "button", onclick: () => delegate(card.number) }, "Copilot에게 맡기기"),
    moves);
}

function renderCard(card) {
  const directory = card.directory && card.directory !== "/" ? card.directory.replace(/^\\//, "") : null;
  return h("article", {
    class: "card" + (card.supersededBy ? " superseded" : "") + (flashing.has(card.number) ? " flash" : ""),
    draggable: "true",
    "data-pr": card.number,
    ondragstart: (event) => event.dataTransfer.setData("text/plain", String(card.number)),
  },
    h("div", { class: "card-top" },
      h("span", { class: "chip" }, ECOSYSTEMS[card.ecosystem] || card.ecosystem),
      directory ? h("span", { class: "muted" }, directory) : null,
      link(card.url, "#" + card.number, "pr-link")),
    h("div", { class: "package" }, card.packageName),
    renderVersion(card),
    renderCi(card.ci, card.number),
    card.briefing ? h("div", { class: "today" }, "오늘 " + rank(card.briefing.rank) + (card.briefing.category ? " · " + card.briefing.category : "")) : null,
    card.supersededBy ? h("div", { class: "muted" }, "#" + card.supersededBy + "(으)로 대체됨") : null,
    card.pending ? h("div", { class: "working" }, h("span", { class: "spinner" }), "Copilot이 확인하는 중…") : null,
    card.reason ? h("div", { class: "reason" }, h("span", { class: "reason-by" }, card.reasonBy === "copilot" ? "Copilot" : "메모"), card.reason) : null,
    card.fixPrs.map((fix) => h("div", null, link(fix.url, "수정 PR #" + fix.number + (fix.isDraft ? " (Draft)" : "") + " ↗"))),
    renderActions(card));
}

function renderColumn(column) {
  const cards = sortCards(board.cards.filter((card) => card.column === column.id), column.id);
  const element = h("section", { class: "column", "data-column": column.id },
    h("div", { class: "column-head" }, h("span", null, column.label), h("span", { class: "count" }, String(cards.length))),
    h("div", { class: "column-body", "data-column": column.id },
      cards.length ? cards.map(renderCard) : h("div", { class: "empty muted" }, "카드 없음")));
  element.addEventListener("dragover", (event) => { event.preventDefault(); element.classList.add("drop-target"); });
  element.addEventListener("dragleave", () => element.classList.remove("drop-target"));
  element.addEventListener("drop", (event) => {
    event.preventDefault();
    element.classList.remove("drop-target");
    const pr = Number(event.dataTransfer.getData("text/plain"));
    const card = board.cards.find((entry) => entry.number === pr);
    if (card && card.column !== column.id) move(pr, column.id);
  });
  return element;
}

function render() {
  const root = document.getElementById("app");
  const scroll = {};
  root.querySelectorAll(".column-body").forEach((element) => { scroll[element.dataset.column] = element.scrollTop; });
  const parts = [renderHeader(), renderStatus()];
  if (board && board.error) parts.push(h("div", { class: "banner" }, board.error));
  parts.push(renderBriefing());
  if (board && board.fetchedAt) parts.push(h("main", { class: "board" }, board.columns.map(renderColumn)));
  root.replaceChildren(...parts.filter(Boolean));
  root.querySelectorAll(".column-body").forEach((element) => { element.scrollTop = scroll[element.dataset.column] || 0; });
}

function update(next) {
  for (const card of next.cards) {
    const previous = lastColumns.get(card.number);
    if (previous && previous !== card.column) {
      flashing.add(card.number);
      setTimeout(() => flashing.delete(card.number), 2400);
    }
    lastColumns.set(card.number, card.column);
  }
  board = next;
  render();
}

const source = new EventSource("events");
source.addEventListener("board", (event) => {
  connected = true;
  update(JSON.parse(event.data));
});
source.addEventListener("open", () => { connected = true; render(); });
source.addEventListener("error", () => { connected = false; render(); });
render();
`;

export function renderPage({ requestToken }) {
    return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Dependabot 관제탑</title>
<style>${STYLE}</style>
</head>
<body>
<div id="app" class="app"></div>
<script>
const TOKEN = ${JSON.stringify(requestToken)};
${SCRIPT}
</script>
</body>
</html>`;
}
