import { Card, MessageBar, Text, Title3, makeStyles, shorthands, tokens } from "@fluentui/react-components";
import { AnalysisProgress, WorkflowGraph } from "./api";

const useStyles = makeStyles({
  panel: { padding: tokens.spacingVerticalL },
  stack: { display: "grid", gap: tokens.spacingVerticalM },
  stages: { display: "grid", gap: tokens.spacingVerticalS },
  stage: { display: "grid", gap: tokens.spacingVerticalXS },
  row: { display: "grid", gap: tokens.spacingHorizontalS, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" },
  schoolGrid: { display: "grid", gap: tokens.spacingVerticalL, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" },
  school: { display: "grid", gap: tokens.spacingVerticalS },
  schoolTitle: { color: tokens.colorBrandForeground1 },
  node: {
    padding: tokens.spacingVerticalS,
    borderRadius: tokens.borderRadiusMedium,
    ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
    backgroundColor: tokens.colorNeutralBackground1,
    display: "grid",
    gap: tokens.spacingVerticalXXS,
  },
  nodeRunning: { ...shorthands.borderColor(tokens.colorBrandStroke1), backgroundColor: tokens.colorBrandBackground2 },
  nodeDone: { ...shorthands.borderColor(tokens.colorPaletteGreenBorder2), backgroundColor: tokens.colorPaletteGreenBackground1 },
  meta: { color: tokens.colorNeutralForeground3 },
  arrow: { color: tokens.colorNeutralForeground3, textAlign: "center" },
});

export type NodeState = "idle" | "running" | "done";

const STAGE_LABELS = ["1단계 · 급식 정보 정규화", "2단계 · 영역별 평가 (concurrent fan-out)", "3단계 · 최종 종합 (sequential fan-in)"];

export type WorkflowViewProps = {
  graph?: WorkflowGraph;
  nodeStates: Record<string, NodeState>;
  progress: AnalysisProgress[];
  activeSchool?: string;
  schoolNames?: string[];
};

export function WorkflowView({ graph, nodeStates, progress, activeSchool, schoolNames = [] }: WorkflowViewProps) {
  const styles = useStyles();
  if (!graph) return null;
  const stages = [...new Set(graph.nodes.map(node => node.stage))].sort((a, b) => a - b);
  const schools = schoolNames.length > 0 ? schoolNames : [activeSchool ?? "분석 대상 학교"];
  const scoreFor = (nodeId: string, schoolName: string) =>
    progress.filter(item => item.agentName === nodeId && item.schoolName === schoolName).at(-1);
  const derivedStateFor = (nodeId: string, schoolName: string): NodeState => {
    const schoolProgress = progress.filter(item => item.schoolName === schoolName);
    const hasProgress = schoolProgress.length > 0;
    const areaIds = graph.nodes.filter(node => node.kind === "area").map(node => node.id);
    const allAreasDone = areaIds.every(id => schoolProgress.some(item => item.agentName === id));
    const node = graph.nodes.find(item => item.id === nodeId);
    if (node?.kind === "prepare") return hasProgress || activeSchool === schoolName ? "done" : "idle";
    if (node?.kind === "synthesis") return allAreasDone ? "done" : activeSchool === schoolName ? "running" : "idle";
    return schoolProgress.some(item => item.agentName === nodeId)
      ? "done"
      : activeSchool === schoolName
        ? "running"
        : "idle";
  };

  return (
    <Card className={styles.panel}>
      <div className={styles.stack}>
        <header className={styles.stage}>
          <Title3>워크플로우 시각화</Title3>
          <Text className={styles.meta}>패턴: {graph.pattern}{activeSchool ? ` · 진행 중: ${activeSchool}` : ""}</Text>
        </header>
        <section aria-label="워크플로우 그래프" className={styles.schoolGrid}>
          {schools.map((schoolName, schoolIndex) => (
            <div className={styles.school} key={`${schoolName}-${schoolIndex}`}>
              <Text weight="semibold" className={styles.schoolTitle}>{schoolName}</Text>
              <div className={styles.stages}>
                {stages.map((stage, stageIndex) => (
                  <div className={styles.stage} key={stage}>
                    <Text weight="semibold" className={styles.meta}>{STAGE_LABELS[stage] ?? `${stage + 1}단계`}</Text>
                    <div className={styles.row}>
                      {graph.nodes.filter(node => node.stage === stage).map(node => {
                        const state = schoolIndex === 0 && nodeStates[node.id] ? nodeStates[node.id] : derivedStateFor(node.id, schoolName);
                        const score = scoreFor(node.id, schoolName);
                        return (
                          <div
                            key={node.id}
                            data-testid={`workflow-node-${node.id}${schoolIndex === 0 ? "" : `-${schoolIndex}`}`}
                            data-state={state}
                            className={`${styles.node} ${state === "running" ? styles.nodeRunning : ""} ${state === "done" ? styles.nodeDone : ""}`}
                          >
                            <Text weight="semibold">{node.label}</Text>
                            <Text className={styles.meta}>
                              {state === "running" ? "실행 중" : state === "done" ? "완료" : "대기"}
                              {score ? ` · ${score.score}/5 · 가중 ${score.weightedScore.toFixed(2)}점` : ""}
                            </Text>
                          </div>
                        );
                      })}
                    </div>
                    {stageIndex < stages.length - 1 && <div className={styles.arrow} aria-hidden="true">↓ {graph.edges.find(edge => edge.kind === (stage === 0 ? "fan-out" : "fan-in"))?.kind}</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
        {progress.length === 0 && <MessageBar>분석을 시작하면 각 에이전트의 진행 상황이 표시됩니다.</MessageBar>}
      </div>
    </Card>
  );
}
