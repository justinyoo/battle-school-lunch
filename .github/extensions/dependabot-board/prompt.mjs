const ECOSYSTEMS = { pip: "pip", npm_and_yarn: "npm", github_actions: "GitHub Actions", docker: "Docker" };

export function buildDelegatePrompt(card, instanceId) {
    const number = card.number;
    const ecosystem = ECOSYSTEMS[card.ecosystem] ?? card.ecosystem;
    const where = card.directory && card.directory !== "/" ? `${ecosystem}, ${card.directory}` : ecosystem;
    const version = card.from && card.to ? `${card.from} → ${card.to}` : "버전 정보 없음";
    const failed = card.ci.failed.map((check) => check.name).join(", ");

    const lines = [
        `[Dependabot 관제탑] PR #${number}을(를) 분류해 줘.`,
        "",
        `- 패키지: ${card.packageName} (${where}) · ${version}`,
        failed
            ? `- 실패한 CI job: ${failed}`
            : `- CI: ${card.ci.state === "passing" ? "모두 통과" : card.ci.state === "pending" ? "진행 중" : "체크 없음"}`,
        card.supersededBy ? `- 같은 패키지를 더 새 버전으로 올리는 PR #${card.supersededBy}이(가) 있음` : null,
        "",
        failed
            ? `1. \`gh pr checks ${number}\`로 실패한 job을 찾고 \`gh run view <run-id> --log-failed\`로 오류를 보여 주는 한 줄을 확인해.`
            : `1. \`gh pr view ${number}\`로 변경 내용과 릴리스 노트를 확인해.`,
        failed
            ? "2. 원인을 호환성 깨짐 / 의존성 충돌 / 변경과 무관해 보임 / E2E 실패 중 하나로 분류하고, merge(바로 머지) · fix(수정 필요) · hold(보류) 중 하나를 골라."
            : "2. 주의할 변경이 있는지 보고 merge(바로 머지) · fix(수정 필요) · hold(보류) 중 하나를 골라.",
        `3. invoke_canvas_action으로 instanceId "${instanceId}"의 set_verdict를 호출해 {"pr": ${number}, "column": "...", "reason": "[분류] 한 줄 근거"}를 기록해. reason은 80자 이내로.`,
        "",
        "읽기 전용으로 진행해. 파일 수정, 커밋, PR 댓글·승인·머지·닫기는 하지 말고, 로그에 보이는 비밀 값은 옮기지 마.",
    ];
    return lines.filter((line) => line !== null).join("\n");
}
