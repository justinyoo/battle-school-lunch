"""백엔드에 통합된 워크플로우 시각화 dev UI.

`/dev/workflow`에서 서빙되며 `/api/analysis/workflow` 그래프를 그린 뒤
`/api/analysis/agui` SSE 이벤트를 구독해 노드 상태를 실시간으로 갱신한다.
외부 자산 없이 단일 HTML로 동작한다.
"""

from __future__ import annotations

DEV_UI_HTML = """<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>급식배틀 멀티에이전트 워크플로우</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; padding: 24px; font-family: "Segoe UI", system-ui, sans-serif; background: #f3f4f6; color: #111827; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.lead { margin: 0 0 20px; color: #4b5563; font-size: 14px; }
  form { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; background: #fff; padding: 16px; border-radius: 10px; margin-bottom: 20px; }
  label { display: flex; flex-direction: column; font-size: 12px; gap: 4px; color: #374151; }
  input, textarea { padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 6px; font: inherit; }
  textarea { width: 100%; min-height: 64px; }
  button { padding: 8px 16px; border: 0; border-radius: 6px; background: #2563eb; color: #fff; font: inherit; cursor: pointer; }
  button:disabled { background: #9ca3af; cursor: not-allowed; }
  .stages { display: flex; gap: 16px; align-items: stretch; overflow-x: auto; padding-bottom: 8px; }
  .stage { display: flex; flex-direction: column; gap: 8px; min-width: 220px; }
  .stage h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #6b7280; margin: 0; }
  .node { background: #fff; border: 2px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; font-size: 13px; }
  .node.running { border-color: #f59e0b; }
  .node.done { border-color: #16a34a; }
  .node .score { font-weight: 600; color: #2563eb; }
  .node .rationale { color: #4b5563; font-size: 12px; margin-top: 4px; white-space: pre-wrap; }
  .panel { background: #fff; border-radius: 10px; padding: 16px; margin-top: 20px; }
  .panel h2 { font-size: 14px; margin: 0 0 8px; }
  pre { background: #111827; color: #e5e7eb; padding: 12px; border-radius: 8px; overflow: auto; max-height: 320px; font-size: 12px; }
  .summary { font-size: 14px; line-height: 1.6; }
</style>
</head>
<body>
<h1>급식배틀 멀티에이전트 워크플로우</h1>
<p class="lead">concurrent fan-out &rarr; sequential fan-in 패턴으로 두 학교의 중식을 평가합니다.</p>

<form id="run-form">
  <label>교육청코드 A<input name="office1" value="B10" required /></label>
  <label>학교코드 A<input name="code1" value="1234567" required /></label>
  <label>학교명 A<input name="name1" value="서울고등학교" required /></label>
  <label>교육청코드 B<input name="office2" value="B10" required /></label>
  <label>학교코드 B<input name="code2" value="7654321" required /></label>
  <label>학교명 B<input name="name2" value="서울중학교" required /></label>
  <label>날짜(YYYYMMDD)<input name="date" id="date" required pattern="\\d{8}" /></label>
  <button type="submit" id="run">분석 실행</button>
</form>
<label style="display:block;margin-bottom:20px;font-size:12px;color:#374151">프롬프트
  <textarea id="prompt"></textarea>
</label>

<div class="stages" id="stages"></div>

<div class="panel">
  <h2>배틀 결과</h2>
  <div class="summary" id="summary">아직 실행하지 않았습니다.</div>
</div>

<div class="panel">
  <h2>AG-UI 이벤트</h2>
  <pre id="events"></pre>
</div>

<script>
const stagesEl = document.getElementById('stages');
const eventsEl = document.getElementById('events');
const summaryEl = document.getElementById('summary');
const promptEl = document.getElementById('prompt');
const dateEl = document.getElementById('date');
const form = document.getElementById('run-form');
const runBtn = document.getElementById('run');
const nodeEls = new Map();

const today = new Date();
dateEl.value = today.getFullYear() + String(today.getMonth() + 1).padStart(2, '0') + String(today.getDate()).padStart(2, '0');

function log(line) {
  eventsEl.textContent += line + '\\n';
  eventsEl.scrollTop = eventsEl.scrollHeight;
}

function renderGraph(graph) {
  stagesEl.innerHTML = '';
  nodeEls.clear();
  const stages = new Map();
  for (const node of graph.nodes) {
    if (!stages.has(node.stage)) stages.set(node.stage, []);
    stages.get(node.stage).push(node);
  }
  for (const [stage, nodes] of [...stages.entries()].sort((a, b) => a[0] - b[0])) {
    const col = document.createElement('div');
    col.className = 'stage';
    const title = document.createElement('h2');
    title.textContent = stage === 0 ? '준비' : stage === 1 ? 'fan-out 평가' : 'fan-in 종합';
    col.appendChild(title);
    for (const node of nodes) {
      const el = document.createElement('div');
      el.className = 'node';
      el.innerHTML = '<div>' + node.label + '</div>';
      col.appendChild(el);
      nodeEls.set(node.id, el);
    }
    stagesEl.appendChild(col);
  }
}

function markNode(id, state, extra) {
  const el = nodeEls.get(id);
  if (!el) return;
  el.classList.remove('running', 'done');
  el.classList.add(state);
  if (extra) {
    let detail = el.querySelector('.rationale');
    if (!detail) {
      detail = document.createElement('div');
      detail.className = 'rationale';
      el.appendChild(detail);
    }
    detail.textContent = extra;
  }
}

async function loadGraph() {
  const res = await fetch('/api/analysis/workflow');
  renderGraph(await res.json());
}

function buildPayload() {
  const data = new FormData(form);
  return {
    schools: [
      { educationOfficeCode: data.get('office1'), schoolCode: data.get('code1'), name: data.get('name1') },
      { educationOfficeCode: data.get('office2'), schoolCode: data.get('code2'), name: data.get('name2') }
    ],
    date: data.get('date'),
    prompt: promptEl.value
  };
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  runBtn.disabled = true;
  eventsEl.textContent = '';
  summaryEl.textContent = '분석 중...';
  await loadGraph();
  try {
    const res = await fetch('/api/analysis/agui', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload())
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      summaryEl.textContent = (body && body.error && body.error.message) || '분석 요청에 실패했습니다.';
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\\n\\n');
      buffer = chunks.pop() || '';
      for (const chunk of chunks) {
        const line = chunk.split('\\n').find((item) => item.startsWith('data: '));
        if (!line) continue;
        handleEvent(JSON.parse(line.slice(6)));
      }
    }
  } catch (error) {
    summaryEl.textContent = '분석 중 오류가 발생했습니다.';
  } finally {
    runBtn.disabled = false;
  }
});

function handleEvent(event) {
  log(event.type + (event.name ? ' · ' + event.name : ''));
  if (event.type === 'CUSTOM' && event.name === 'workflow.graph') {
    renderGraph(event.value);
  } else if (event.type === 'STEP_STARTED') {
    markNode('prepare-meal-facts', 'running', event.stepName);
  } else if (event.type === 'CUSTOM' && event.name === 'workflow.area') {
    markNode('prepare-meal-facts', 'done');
    markNode(event.value.agentName, 'done', event.value.schoolName + ' · ' + event.value.score + '/5 · ' + event.value.weightedScore + '점\\n' + event.value.rationale);
  } else if (event.type === 'CUSTOM' && event.name === 'workflow.school') {
    markNode('final-synthesis-agent', 'done', event.value.schoolName + ' 총점 ' + event.value.total + '점 (' + event.value.interpretation + ')');
  } else if (event.type === 'CUSTOM' && event.name === 'workflow.battle') {
    summaryEl.textContent = event.value.summary;
  } else if (event.type === 'RUN_ERROR') {
    summaryEl.textContent = event.message;
  }
}

loadGraph();
</script>
</body>
</html>
"""

__all__ = ["DEV_UI_HTML"]
