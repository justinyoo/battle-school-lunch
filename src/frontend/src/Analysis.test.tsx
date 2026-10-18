import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Analysis, analysisDates } from "./Analysis";
import { fetchAnalysisPrompt, fetchRandomSchools, fetchWorkflowGraph, runAnalysis } from "./api";

vi.mock("./api", () => ({
  fetchRandomSchools: vi.fn(),
  fetchAnalysisPrompt: vi.fn(),
  fetchWorkflowGraph: vi.fn(),
  runAnalysis: vi.fn(),
}));

const mockedRandom = vi.mocked(fetchRandomSchools);
const mockedPrompt = vi.mocked(fetchAnalysisPrompt);
const mockedGraph = vi.mocked(fetchWorkflowGraph);
const mockedRun = vi.mocked(runAnalysis);

const graph = {
  pattern: "concurrent-fan-out-sequential-fan-in",
  nodes: [
    { id: "prepare-meal-facts", label: "급식 정보 정규화", kind: "prepare", stage: 0 },
    { id: "nutrition-health-agent", label: "영양·건강성 (35점)", kind: "area", stage: 1 },
    { id: "ingredient-safety-agent", label: "식재료·안전성 (25점)", kind: "area", stage: 1 },
    { id: "final-synthesis-agent", label: "최종 종합 (100점 환산)", kind: "synthesis", stage: 2 },
  ],
  edges: [
    { from: "prepare-meal-facts", to: "nutrition-health-agent", kind: "fan-out" },
    { from: "nutrition-health-agent", to: "final-synthesis-agent", kind: "fan-in" },
  ],
};

const pool = Array.from({ length: 10 }, (_, index) => ({
  educationOfficeCode: "B10",
  schoolCode: `100${index}`,
  name: `학교${index}`,
  schoolKind: "고등학교",
  location: `지역${index}`,
}));

const area = (id: string, title: string, weight: number, score: number, weighted: number) => ({
  areaId: id,
  agentName: `${id}-agent`,
  title,
  weight,
  score,
  weightedScore: weighted,
  rationale: `${title} 근거`,
  evidence: [],
  mode: "deterministic",
});

const result = {
  prompt: "프롬프트",
  date: "20260807",
  pattern: "concurrent-fan-out-sequential-fan-in",
  schools: [
    {
      schoolName: "학교0",
      date: "20260807",
      total: 82.5,
      interpretation: "우수",
      commentary: "학교0 총평",
      areas: [area("nutrition-health", "영양·건강성", 35, 5, 35)],
      menu: ["기장밥", "미역국"],
      hasMeal: true,
    },
    {
      schoolName: "학교1",
      date: "20260807",
      total: 60.0,
      interpretation: "개선 필요",
      commentary: "학교1 총평",
      areas: [area("nutrition-health", "영양·건강성", 35, 3, 21)],
      menu: [],
      hasMeal: false,
    },
  ],
  battle: { outcome: "win" as const, winner: "학교0", loser: "학교1", margin: 22.5, summary: "학교0가 이겼습니다." },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedRandom.mockResolvedValue({ items: pool });
  mockedPrompt.mockResolvedValue({ prompt: "기본 프롬프트" });
  mockedGraph.mockResolvedValue(graph);
  mockedRun.mockResolvedValue(result);
});

afterEach(() => cleanup());

/** 학교를 두 곳 고른 뒤 열리는 날짜 섹션에서 날짜를 확정해 프롬프트 섹션까지 연다. */
const closeSteps = async (user: ReturnType<typeof userEvent.setup>) => {
  const picker = await screen.findByLabelText("분석 날짜");
  const target = analysisDates().at(-1) as string;
  fireEvent.change(picker, { target: { value: target } });
  fireEvent.blur(picker);
  await screen.findByLabelText("프롬프트");
  await user.click(screen.getByRole("button", { name: /^프롬프트$/ }));
  await waitFor(() => expect(screen.queryByLabelText("프롬프트")).not.toBeInTheDocument());
};

describe("급식 배틀 분석 페이지", () => {
  it("이번 달과 직전 달의 날짜만 선택 후보로 제공한다", () => {
    const dates = analysisDates(new Date(2026, 2, 15));
    expect(dates[0]).toBe("2026-02-01");
    expect(dates.at(-1)).toBe("2026-03-31");
    expect(dates).not.toContain("2026-01-31");
    expect(dates).not.toContain("2026-04-01");
  });

  it("학교를 고르면 날짜 섹션이 열리고 날짜를 고르면 프롬프트 섹션이 열린다", async () => {
    const user = userEvent.setup();
    render(<Analysis />);

    expect(screen.queryByLabelText("분석 날짜")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("프롬프트")).not.toBeInTheDocument();

    const list = await screen.findByRole("region", { name: "분석 대상 학교" });
    await user.click(within(list).getByRole("button", { name: /학교0/ }));
    expect(screen.queryByLabelText("분석 날짜")).not.toBeInTheDocument();

    await user.click(within(list).getByRole("button", { name: /학교1/ }));

    const picker = await screen.findByLabelText("분석 날짜");
    expect(screen.queryByLabelText("프롬프트")).not.toBeInTheDocument();

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(picker).toHaveValue(today);

    const target = analysisDates().at(-1) as string;
    fireEvent.change(picker, { target: { value: target } });
    fireEvent.blur(picker);

    expect(await screen.findByLabelText("프롬프트")).toBeInTheDocument();
    expect(screen.queryByLabelText("분석 날짜")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "분석 시작" })).toBeEnabled();
  });

  it("StrictMode에서 늦게 도착한 이전 학교 목록 응답이 선택을 초기화하지 않는다", async () => {
    const user = userEvent.setup();
    const responses: Array<(value: { items: typeof pool }) => void> = [];
    mockedRandom.mockImplementation(() => new Promise(resolve => responses.push(resolve)));
    render(<StrictMode><Analysis /></StrictMode>);

    await waitFor(() => expect(responses).toHaveLength(2));
    await act(async () => responses[1]({ items: pool }));

    const list = await screen.findByRole("region", { name: "분석 대상 학교" });
    await user.click(within(list).getByRole("button", { name: /학교0/ }));
    await user.click(within(list).getByRole("button", { name: /학교1/ }));
    expect(await screen.findByLabelText("분석 날짜")).toBeInTheDocument();

    const stale = pool.map(school => ({ ...school, name: `이전${school.name}` }));
    await act(async () => responses[0]({ items: stale }));

    expect(screen.getByLabelText("분석 날짜")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /학교 선택 · 학교0 vs 학교1/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /이전학교0/ })).not.toBeInTheDocument();
  });

  it("무작위 학교 10곳을 보여주고 두 곳을 고르면 선택 결과만 남긴다", async () => {
    const user = userEvent.setup();
    render(<Analysis />);

    const list = await screen.findByRole("region", { name: "분석 대상 학교" });
    expect(within(list).getAllByRole("button")).toHaveLength(10);
    expect(within(list).getByRole("button", { name: "학교0 · 고등학교 · 지역0" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "분석 시작" })).toBeDisabled();

    await user.click(within(list).getByRole("button", { name: /학교0/ }));
    await user.click(within(list).getByRole("button", { name: /학교1/ }));
    await closeSteps(user);

    expect(screen.queryByRole("region", { name: "분석 대상 학교" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /학교 선택 · 학교0 vs 학교1/ }));
    const picked = screen.getByRole("region", { name: "선택한 학교" });
    expect(within(picked).getAllByRole("button")).toHaveLength(2);
    expect(within(picked).getByRole("button", { name: "학교0 · 고등학교 · 지역0" })).toBeInTheDocument();
    expect(within(picked).getByRole("button", { name: "학교1 · 고등학교 · 지역1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "분석 시작" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "다시 선택" }));
    expect(await screen.findByRole("region", { name: "분석 대상 학교" })).toBeInTheDocument();
  });

  it("선택한 두 학교로 기본 프롬프트를 만들고 편집할 수 있다", async () => {
    const user = userEvent.setup();
    render(<Analysis />);

    const list = await screen.findByRole("region", { name: "분석 대상 학교" });
    await user.click(within(list).getByRole("button", { name: /학교0/ }));
    await user.click(within(list).getByRole("button", { name: /학교1/ }));

    await waitFor(() => expect(mockedPrompt).toHaveBeenCalledWith("학교0", "학교1", expect.any(String), "지역0", "지역1"));
    const picker = await screen.findByLabelText("분석 날짜");
    const target = analysisDates().at(-1) as string;
    fireEvent.change(picker, { target: { value: target } });
    fireEvent.blur(picker);
    const textarea = await screen.findByLabelText("프롬프트");
    await waitFor(() => expect(textarea).toHaveValue("기본 프롬프트"));

    await user.clear(textarea);
    await user.type(textarea, "직접 수정한 프롬프트");
    expect(textarea).toHaveValue("직접 수정한 프롬프트");
  });

  it("분석 결과의 승자, 총점, 영역별 점수를 표시한다", async () => {
    const user = userEvent.setup();
    render(<Analysis />);

    const list = await screen.findByRole("region", { name: "분석 대상 학교" });
    await user.click(within(list).getByRole("button", { name: /학교0/ }));
    await user.click(within(list).getByRole("button", { name: /학교1/ }));
    await closeSteps(user);
    await user.click(screen.getByRole("button", { name: "분석 시작" }));

    const region = await screen.findByRole("region", { name: "분석 결과" });
    expect(within(region).getByText("승자: 학교0")).toBeInTheDocument();
    expect(within(region).getByText(/패자: 학교1/)).toBeInTheDocument();
    expect(within(region).getByText(/학교0 · 총점 82.50점 · 우수/)).toBeInTheDocument();
    expect(within(region).getByText(/학교1 · 총점 60.00점 · 개선 필요/)).toBeInTheDocument();
    expect(within(region).getAllByText("영양·건강성")).toHaveLength(2);
    expect(within(region).getByText("이 날짜에는 중식 정보가 없습니다.")).toBeInTheDocument();

    const workflow = await screen.findByRole("region", { name: "워크플로우 그래프" });
    expect(within(workflow).getByText("학교0")).toBeInTheDocument();
    expect(within(workflow).getByText("학교1")).toBeInTheDocument();
  });

  it("분석 실패 시 오류 메시지를 표시한다", async () => {
    mockedRun.mockRejectedValue(new Error("분석에 실패했습니다."));
    const user = userEvent.setup();
    render(<Analysis />);

    const list = await screen.findByRole("region", { name: "분석 대상 학교" });
    await user.click(within(list).getByRole("button", { name: /학교0/ }));
    await user.click(within(list).getByRole("button", { name: /학교1/ }));
    await closeSteps(user);
    await user.click(screen.getByRole("button", { name: "분석 시작" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("분석에 실패했습니다.");
  });

  it("결과 아래에 워크플로우 그래프를 단계별로 보여준다", async () => {
    render(<Analysis />);

    const region = await screen.findByRole("region", { name: "워크플로우 그래프" });
    expect(within(region).getByText("급식 정보 정규화")).toBeInTheDocument();
    expect(within(region).getByText("영양·건강성 (35점)")).toBeInTheDocument();
    expect(within(region).getByText("최종 종합 (100점 환산)")).toBeInTheDocument();
    expect(screen.getByText(/concurrent-fan-out-sequential-fan-in/)).toBeInTheDocument();
  });

  it("분석 진행 중 에이전트 노드 상태와 점수를 갱신한다", async () => {
    mockedRun.mockImplementation(async (_schools, _date, _prompt, onProgress, onStep) => {
      onStep?.({ kind: "step-started", schoolName: "학교0" });
      onProgress?.({ agentName: "nutrition-health-agent", schoolName: "학교0", score: 5, weightedScore: 35, title: "영양·건강성" });
      onStep?.({ kind: "school-finished", schoolName: "학교0" });
      onStep?.({ kind: "battle-finished" });
      return result;
    });
    const user = userEvent.setup();
    render(<Analysis />);

    const list = await screen.findByRole("region", { name: "분석 대상 학교" });
    await user.click(within(list).getByRole("button", { name: /학교0/ }));
    await user.click(within(list).getByRole("button", { name: /학교1/ }));
    await closeSteps(user);
    await user.click(screen.getByRole("button", { name: "분석 시작" }));

    await waitFor(() => expect(screen.getByTestId("workflow-node-nutrition-health-agent")).toHaveAttribute("data-state", "done"));
    expect(screen.getByTestId("workflow-node-prepare-meal-facts")).toHaveAttribute("data-state", "done");
    expect(screen.getByTestId("workflow-node-final-synthesis-agent")).toHaveAttribute("data-state", "done");
    expect(screen.getByTestId("workflow-node-ingredient-safety-agent")).toHaveAttribute("data-state", "running");
    expect(within(screen.getByTestId("workflow-node-nutrition-health-agent")).getByText(/5\/5 · 가중 35.00점/)).toBeInTheDocument();
  });
});
