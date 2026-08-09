import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Field, MessageBar, Spinner, Text, Textarea, Title2, makeStyles, tokens } from "@fluentui/react-components";
import { AnalysisProgress, AnalysisResult, AnalysisTarget, School, WorkflowGraph, fetchAnalysisPrompt, fetchRandomSchools, fetchWorkflowGraph, runAnalysis } from "./api";
import { NodeState, WorkflowView } from "./WorkflowView";

const useStyles = makeStyles({
  stack: { display: "grid", gap: tokens.spacingVerticalM },
  panel: { padding: tokens.spacingVerticalL },
  grid: { display: "grid", gap: tokens.spacingVerticalS, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" },
  areas: { display: "grid", gap: tokens.spacingVerticalXS },
  meta: { color: tokens.colorNeutralForeground3 },
});

const pad = (value: number) => String(value).padStart(2, "0");
const toIso = (value: Date) => `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;

/** 이번 달과 직전 달의 날짜만 분석 대상으로 허용한다. */
export const analysisDates = (today = new Date()): string[] => {
  const dates: string[] = [];
  const cursor = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  while (cursor <= end) {
    dates.push(toIso(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

const key = (school: School | AnalysisTarget) => `${school.educationOfficeCode}:${school.schoolCode}`;

export function Analysis() {
  const styles = useStyles();
  const [pool, setPool] = useState<School[]>([]);
  const [selected, setSelected] = useState<School[]>([]);
  const [dates] = useState(() => analysisDates());
  const [date, setDate] = useState(() => toIso(new Date()));
  const [prompt, setPrompt] = useState("");
  const [promptEdited, setPromptEdited] = useState(false);
  const [result, setResult] = useState<AnalysisResult>();
  const [progress, setProgress] = useState<AnalysisProgress[]>([]);
  const [graph, setGraph] = useState<WorkflowGraph>();
  const [nodeStates, setNodeStates] = useState<Record<string, NodeState>>({});
  const [activeSchool, setActiveSchool] = useState<string>();
  const [loadingPool, setLoadingPool] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const runId = useRef(0);

  const loadPool = async () => {
    setLoadingPool(true);
    setError("");
    try {
      const response = await fetchRandomSchools();
      setPool(response.items);
      setSelected([]);
      setResult(undefined);
    } catch (e) {
      setPool([]);
      setError(e instanceof Error ? e.message : "학교 목록을 불러오지 못했습니다.");
    } finally {
      setLoadingPool(false);
    }
  };

  useEffect(() => {
    void loadPool();
  }, []);

  useEffect(() => {
    let active = true;
    void fetchWorkflowGraph()
      .then(response => {
        if (active) setGraph(response);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (selected.length !== 2 || promptEdited) return;
    let active = true;
    void fetchAnalysisPrompt(selected[0].name, selected[1].name, date)
      .then(response => {
        if (active) setPrompt(response.prompt);
      })
      .catch(() => {
        if (active) setPrompt("");
      });
    return () => {
      active = false;
    };
  }, [selected, date, promptEdited]);

  const toggle = (school: School) => {
    setResult(undefined);
    setSelected(current => {
      const exists = current.some(item => key(item) === key(school));
      if (exists) return current.filter(item => key(item) !== key(school));
      if (current.length >= 2) return current;
      return [...current, school];
    });
  };

  const targets = useMemo<AnalysisTarget[]>(
    () => selected.map(item => ({ educationOfficeCode: item.educationOfficeCode, schoolCode: item.schoolCode, name: item.name })),
    [selected],
  );

  const areaIds = useMemo(() => (graph?.nodes ?? []).filter(node => node.kind === "area").map(node => node.id), [graph]);

  const start = async () => {
    if (selected.length !== 2) {
      setError("학교를 정확히 두 곳 선택해 주세요.");
      return;
    }
    const requestId = ++runId.current;
    setError("");
    setResult(undefined);
    setProgress([]);
    setNodeStates({});
    setActiveSchool(undefined);
    setRunning(true);
    try {
      const response = await runAnalysis(
        targets,
        date,
        prompt,
        update => {
          if (requestId !== runId.current) return;
          setProgress(current => [...current, update]);
          setNodeStates(current => ({ ...current, [update.agentName]: "done" }));
        },
        step => {
          if (requestId !== runId.current) return;
          if (step.kind === "step-started") {
            setActiveSchool(step.schoolName);
            setNodeStates(current => ({ ...current, "prepare-meal-facts": "done", ...areaIds.reduce((acc, id) => ({ ...acc, [id]: "running" }), {}), "final-synthesis-agent": "idle" }));
          }
          if (step.kind === "school-finished") setNodeStates(current => ({ ...current, "final-synthesis-agent": "done" }));
          if (step.kind === "battle-finished") setActiveSchool(undefined);
        },
      );
      if (requestId === runId.current) setResult(response);
    } catch (e) {
      if (requestId === runId.current) setError(e instanceof Error ? e.message : "분석에 실패했습니다.");
    } finally {
      if (requestId === runId.current) setRunning(false);
    }
  };

  return (
    <div className={styles.stack}>
      <header className={styles.stack}>
        <Title2>급식 배틀 분석</Title2>
        <Text>무작위 학교 10곳 중 두 곳을 골라 중식을 비교 평가합니다.</Text>
      </header>
      {error && <MessageBar intent="error" role="alert">{error}</MessageBar>}

      <Card className={styles.panel}>
        <div className={styles.stack}>
          <div className="inline">
            <Text weight="semibold">학교 선택 ({selected.length}/2)</Text>
            <Button appearance="secondary" onClick={() => void loadPool()} disabled={loadingPool || running}>다시 뽑기</Button>
          </div>
          {loadingPool && <Spinner label="학교 목록을 불러오는 중입니다." />}
          {!loadingPool && pool.length === 0 && <MessageBar>표시할 학교가 없습니다.</MessageBar>}
          {!loadingPool && pool.length > 0 && (
            <section aria-label="분석 대상 학교" className={styles.grid}>
              {pool.map(item => {
                const active = selected.some(entry => key(entry) === key(item));
                return (
                  <Button
                    key={key(item)}
                    appearance={active ? "primary" : "secondary"}
                    aria-pressed={active}
                    onClick={() => toggle(item)}
                    disabled={running || (!active && selected.length >= 2)}
                  >
                    {item.name} · {item.schoolKind}
                  </Button>
                );
              })}
            </section>
          )}
        </div>
      </Card>

      <Card className={styles.panel}>
        <div className={styles.stack}>
          <Field label="분석 날짜" hint="이번 달과 직전 달의 날짜만 선택할 수 있습니다.">
            <select
              aria-label="분석 날짜"
              value={date}
              disabled={running}
              onChange={event => {
                setResult(undefined);
                setDate(event.target.value);
              }}
            >
              {dates.map(item => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </Field>
          <Field label="프롬프트" hint="기본 프롬프트를 그대로 쓰거나 직접 수정할 수 있습니다.">
            <Textarea
              aria-label="프롬프트"
              value={prompt}
              disabled={running}
              resize="vertical"
              onChange={(_, data) => {
                setPromptEdited(true);
                setPrompt(data.value);
              }}
            />
          </Field>
          <Button appearance="primary" onClick={() => void start()} disabled={running || selected.length !== 2}>
            {running ? <Spinner size="tiny" /> : "분석 시작"}
          </Button>
        </div>
      </Card>

      {running && (
        <Card className={styles.panel}>
          <div className={styles.stack}>
            <Spinner label="멀티 에이전트가 급식을 평가하는 중입니다." />
            <ul aria-label="분석 진행 상황">
              {progress.map((item, index) => (
                <li key={`${item.agentName}-${index}`}>{item.schoolName} · {item.title} · {item.score}/5</li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {result && (
        <section aria-label="분석 결과" className={styles.stack}>
          <Card className={styles.panel}>
            <div className={styles.stack}>
              <Text weight="semibold">{result.battle.outcome === "tie" ? "동점" : `승자: ${result.battle.winner}`}</Text>
              {result.battle.outcome === "win" && <Text className={styles.meta}>패자: {result.battle.loser} · 점수 차 {result.battle.margin.toFixed(2)}점</Text>}
              <Text>{result.battle.summary}</Text>
            </div>
          </Card>
          {result.schools.map(school => (
            <Card className={styles.panel} key={school.schoolName}>
              <div className={styles.stack}>
                <Text weight="semibold">{school.schoolName} · 총점 {school.total.toFixed(2)}점 · {school.interpretation}</Text>
                {!school.hasMeal && <MessageBar>이 날짜에는 중식 정보가 없습니다.</MessageBar>}
                {school.menu.length > 0 && <Text className={styles.meta}>{school.menu.join(", ")}</Text>}
                <ul className={styles.areas}>
                  {school.areas.map(area => (
                    <li key={area.areaId}>
                      <Text weight="semibold">{area.title}</Text> · {area.score}/5 · 가중 {area.weightedScore.toFixed(2)}점
                      <div className={styles.meta}>{area.rationale}</div>
                    </li>
                  ))}
                </ul>
                <Text>{school.commentary}</Text>
              </div>
            </Card>
          ))}
        </section>
      )}

      <WorkflowView graph={graph} nodeStates={nodeStates} progress={progress} activeSchool={activeSchool} />
    </div>
  );
}
