export type School = { educationOfficeCode: string; schoolCode: string; name: string; schoolKind: string; location: string };
export type Meal = { date: string; mealName: string; menu: string[]; originInfo?: string; calorieInfo?: string; nutritionInfo?: string };
export type MealResponse = { school: { educationOfficeCode: string; schoolCode: string; name: string }; items: Meal[] };
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isErrorEnvelope = (value: unknown): value is { error: { code: string; message: string } } =>
  isRecord(value) &&
  isRecord(value.error) &&
  typeof value.error.code === "string" &&
  typeof value.error.message === "string";
const read = async <T>(url: string, validate: (value: unknown) => value is T): Promise<T> => {
  const response = await fetch(url);
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(response.ok ? "응답 형식이 올바르지 않습니다." : "요청을 처리하지 못했습니다.");
  }
  if (!response.ok) {
    throw new Error(isErrorEnvelope(data) ? data.error.message : "요청을 처리하지 못했습니다.");
  }
  if (!validate(data)) throw new Error("응답 형식이 올바르지 않습니다.");
  return data;
};
const schoolsResponse = (value: unknown): value is { items: School[] } => isRecord(value) && Array.isArray(value.items) && value.items.every(item => isRecord(item) && typeof item.name === "string" && typeof item.schoolCode === "string" && typeof item.educationOfficeCode === "string" && typeof item.schoolKind === "string" && typeof item.location === "string");
const mealsResponse = (value: unknown): value is MealResponse => isRecord(value) && isRecord(value.school) && typeof value.school.name === "string" && Array.isArray(value.items) && value.items.every(item => isRecord(item) && typeof item.date === "string" && typeof item.mealName === "string" && Array.isArray(item.menu) && item.menu.every(entry => typeof entry === "string"));
export const searchSchools = (name: string) => read(`/api/schools?name=${encodeURIComponent(name.trim())}`, schoolsResponse);
export const fetchMeals = (school: School, from: string, to: string) => read(`/api/meals?educationOfficeCode=${school.educationOfficeCode}&schoolCode=${school.schoolCode}&from=${from.replaceAll("-", "")}&to=${to.replaceAll("-", "")}`, mealsResponse);

export type AnalysisArea = { areaId: string; agentName: string; title: string; weight: number; score: number; weightedScore: number; rationale: string; evidence: string[]; mode: string };
export type AnalysisSchoolResult = { schoolName: string; date: string; total: number; interpretation: string; commentary: string; areas: AnalysisArea[]; menu: string[]; hasMeal: boolean };
export type BattleResult = { outcome: "win" | "tie"; winner: string | null; loser: string | null; margin: number; summary: string };
export type AnalysisResult = { prompt: string; date: string; pattern: string; schools: AnalysisSchoolResult[]; battle: BattleResult };
export type AnalysisTarget = { educationOfficeCode: string; schoolCode: string; name: string };

const isArea = (value: unknown): value is AnalysisArea =>
  isRecord(value) &&
  typeof value.areaId === "string" &&
  typeof value.agentName === "string" &&
  typeof value.title === "string" &&
  typeof value.weight === "number" &&
  typeof value.score === "number" &&
  typeof value.weightedScore === "number" &&
  typeof value.rationale === "string" &&
  Array.isArray(value.evidence);
const isSchoolResult = (value: unknown): value is AnalysisSchoolResult =>
  isRecord(value) &&
  typeof value.schoolName === "string" &&
  typeof value.total === "number" &&
  typeof value.interpretation === "string" &&
  typeof value.commentary === "string" &&
  Array.isArray(value.areas) &&
  value.areas.every(isArea);
const isBattle = (value: unknown): value is BattleResult =>
  isRecord(value) && (value.outcome === "win" || value.outcome === "tie") && typeof value.summary === "string" && typeof value.margin === "number";
export const isAnalysisResult = (value: unknown): value is AnalysisResult =>
  isRecord(value) &&
  typeof value.prompt === "string" &&
  typeof value.date === "string" &&
  Array.isArray(value.schools) &&
  value.schools.length === 2 &&
  value.schools.every(isSchoolResult) &&
  isBattle(value.battle);

export const fetchRandomSchools = () => read("/api/schools/random", schoolsResponse);

export type WorkflowNode = { id: string; label: string; kind: string; stage: number };
export type WorkflowEdge = { from: string; to: string; kind: string };
export type WorkflowGraph = { pattern: string; nodes: WorkflowNode[]; edges: WorkflowEdge[] };
const isWorkflowGraph = (value: unknown): value is WorkflowGraph =>
  isRecord(value) &&
  typeof value.pattern === "string" &&
  Array.isArray(value.nodes) &&
  value.nodes.every(item => isRecord(item) && typeof item.id === "string" && typeof item.label === "string" && typeof item.kind === "string" && typeof item.stage === "number") &&
  Array.isArray(value.edges) &&
  value.edges.every(item => isRecord(item) && typeof item.from === "string" && typeof item.to === "string" && typeof item.kind === "string");
export const fetchWorkflowGraph = () => read("/api/analysis/workflow", isWorkflowGraph);
const promptResponse = (value: unknown): value is { prompt: string } => isRecord(value) && typeof value.prompt === "string";
export const fetchAnalysisPrompt = (first: string, second: string, date: string) =>
  read(`/api/analysis/prompt?first=${encodeURIComponent(first)}&second=${encodeURIComponent(second)}&date=${date.replaceAll("-", "")}`, promptResponse);

export type AnalysisProgress = { agentName: string; schoolName: string; score: number; weightedScore: number; title: string };
export type AnalysisStep = { kind: "step-started" | "step-finished"; schoolName: string } | { kind: "school-finished"; schoolName: string } | { kind: "battle-finished" };

export const runAnalysis = async (
  schools: AnalysisTarget[],
  date: string,
  prompt: string,
  onProgress?: (progress: AnalysisProgress) => void,
  onStep?: (step: AnalysisStep) => void,
): Promise<AnalysisResult> => {
  const response = await fetch("/api/analysis/agui", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ schools, date: date.replaceAll("-", ""), prompt }),
  });
  if (!response.ok || !response.body) {
    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      throw new Error("분석 요청을 처리하지 못했습니다.");
    }
    throw new Error(isErrorEnvelope(data) ? data.error.message : "분석 요청을 처리하지 못했습니다.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: AnalysisResult | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const line = chunk.split("\n").find(item => item.startsWith("data: "));
      if (!line) continue;
      let event: unknown;
      try {
        event = JSON.parse(line.slice(6));
      } catch {
        continue;
      }
      if (!isRecord(event)) continue;
      if (event.type === "CUSTOM" && event.name === "workflow.area" && isRecord(event.value) && onProgress) {
        const area = event.value;
        if (typeof area.agentName === "string" && typeof area.schoolName === "string" && typeof area.score === "number" && typeof area.weightedScore === "number" && typeof area.title === "string") {
          onProgress({ agentName: area.agentName, schoolName: area.schoolName, score: area.score, weightedScore: area.weightedScore, title: area.title });
        }
      }
      if (onStep) {
        const stepName = typeof event.stepName === "string" ? event.stepName : "";
        const schoolName = stepName.startsWith("prepare:") ? stepName.slice("prepare:".length) : "";
        if (event.type === "STEP_STARTED" && schoolName) onStep({ kind: "step-started", schoolName });
        if (event.type === "STEP_FINISHED" && schoolName) onStep({ kind: "step-finished", schoolName });
        if (event.type === "CUSTOM" && event.name === "workflow.school" && isRecord(event.value) && typeof event.value.schoolName === "string") {
          onStep({ kind: "school-finished", schoolName: event.value.schoolName });
        }
        if (event.type === "CUSTOM" && event.name === "workflow.battle") onStep({ kind: "battle-finished" });
      }
      if (event.type === "RUN_ERROR") throw new Error(typeof event.message === "string" ? event.message : "분석에 실패했습니다.");
      if (event.type === "RUN_FINISHED" && isAnalysisResult(event.result)) result = event.result;
    }
  }
  if (!result) throw new Error("분석 결과를 받지 못했습니다.");
  return result;
};
