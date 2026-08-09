import { Card, MessageBar, Text, Title3, makeStyles, shorthands, tokens } from "@fluentui/react-components";
import { AnalysisProgress, WorkflowGraph } from "./api";

const useStyles = makeStyles({
  panel: { padding: tokens.spacingVerticalL },
  stack: { display: "grid", gap: tokens.spacingVerticalM },
  stages: { display: "grid", gap: tokens.spacingVerticalS },
  stage: { display: "grid", gap: tokens.spacingVerticalXS },
  row: { display: "grid", gap: tokens.spacingHorizontalS, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" },
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
};

export function WorkflowView({ graph, nodeStates, progress, activeSchool }: WorkflowViewProps) {
  const styles = useStyles();
  if (!graph) return null;
  const stages = [...new Set(graph.nodes.map(node => node.stage))].sort((a, b) => a - b);
  const scoreFor = (nodeId: string) => progress.filter(item => item.agentName === nodeId).at(-1);

  return (
    <Card className={styles.panel}>
      <div className={styles.stack}>
        <header className={styles.stage}>
          <Title3>워크플로우 시각화</Title3>
          <Text className={styles.meta}>패턴: {graph.pattern}{activeSchool ? ` · 진행 중: ${activeSchool}` : ""}</Text>
        </header>
        <section aria-label="워크플로우 그래프" className={styles.stages}>
          {stages.map((stage, index) => (
            <div className={styles.stage} key={stage}>
              <Text weight="semibold" className={styles.meta}>{STAGE_LABELS[stage] ?? `${stage + 1}단계`}</Text>
              <div className={styles.row}>
                {graph.nodes.filter(node => node.stage === stage).map(node => {
                  const state = nodeStates[node.id] ?? "idle";
                  const score = scoreFor(node.id);
                  return (
                    <div
                      key={node.id}
                      data-testid={`workflow-node-${node.id}`}
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
              {index < stages.length - 1 && <div className={styles.arrow} aria-hidden="true">↓ {graph.edges.find(edge => edge.kind === (stage === 0 ? "fan-out" : "fan-in"))?.kind}</div>}
            </div>
          ))}
        </section>
        {progress.length === 0 && <MessageBar>분석을 시작하면 각 에이전트의 진행 상황이 표시됩니다.</MessageBar>}
      </div>
    </Card>
  );
}
