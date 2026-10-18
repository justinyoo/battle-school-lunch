import { execFile } from "node:child_process";

const GH_TIMEOUT_MS = 30_000;
const GH_MAX_BUFFER = 32 * 1024 * 1024;
const FAILED_STATES = new Set([
    "FAILURE",
    "ERROR",
    "TIMED_OUT",
    "CANCELLED",
    "ACTION_REQUIRED",
    "STARTUP_FAILURE",
]);
const PASSED_STATES = new Set(["SUCCESS", "NEUTRAL", "SKIPPED", "STALE"]);

export class GhError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

function redact(text) {
    return String(text ?? "")
        .replace(/\b(gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b/g, "***")
        .split(/\r?\n/)
        .find((line) => line.trim())
        ?.trim()
        .slice(0, 160) ?? "";
}

function runGh(args, cwd) {
    return new Promise((resolve, reject) => {
        execFile(
            "gh",
            args,
            {
                cwd,
                timeout: GH_TIMEOUT_MS,
                maxBuffer: GH_MAX_BUFFER,
                windowsHide: true,
                env: { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" },
            },
            (error, stdout, stderr) => {
                if (!error) {
                    resolve(stdout);
                    return;
                }
                if (error.code === "ENOENT") {
                    reject(new GhError("gh_not_found", "gh CLI를 찾지 못했습니다. GitHub CLI를 설치해 주세요."));
                } else if (error.killed) {
                    reject(new GhError("gh_timeout", "gh 명령이 30초 안에 끝나지 않았습니다."));
                } else if (/auth|log in|login/i.test(stderr)) {
                    reject(new GhError("gh_auth", "gh 인증이 필요합니다. `gh auth login`을 실행해 주세요."));
                } else {
                    const detail = redact(stderr);
                    reject(new GhError("gh_failed", detail ? `gh 명령이 실패했습니다: ${detail}` : "gh 명령이 실패했습니다."));
                }
            },
        );
    });
}

function parseJson(text) {
    try {
        return JSON.parse(text);
    } catch {
        throw new GhError("gh_bad_output", "gh 출력이 올바른 JSON이 아닙니다.");
    }
}

function safeGitHubUrl(value) {
    return typeof value === "string" && value.startsWith("https://github.com/") ? value : null;
}

// "1.24" from "<2,>=1.24", "2.3.0" from ">=2.3.0,<3", "6.1.1" from "6.1.1".
export function pickVersion(spec) {
    if (!spec) return null;
    const parts = spec.split(",").map((part) => part.trim()).filter(Boolean);
    const lower =
        parts.find((part) => !part.startsWith("<") && !part.startsWith("!=")) ?? parts[0];
    const match = lower?.match(/\d+(?:\.\d+)*[A-Za-z0-9.+-]*/);
    return match ? match[0] : null;
}

function numericParts(version) {
    const match = version?.match(/^\d+(?:\.\d+)*/);
    return match ? match[0].split(".").map(Number) : null;
}

export function bumpType(from, to) {
    const a = numericParts(from);
    const b = numericParts(to);
    if (!a || !b) return "unknown";
    if (a[0] !== b[0]) return "major";
    if ((a[1] ?? 0) !== (b[1] ?? 0)) return "minor";
    return "patch";
}

const TITLE_PATTERN =
    /^(?:Bump|Update)\s+(\S+)\s+(?:requirement\s+)?from\s+(\S+)\s+to\s+(\S+)(?:\s+in\s+(\S+))?/i;

export function parseTitle(title) {
    const text = String(title ?? "").replace(/^[\w-]+(?:\([^)]*\))?!?:\s*/, "");
    const match = text.match(TITLE_PATTERN);
    if (!match) {
        return { packageName: text || String(title ?? ""), fromSpec: null, toSpec: null, directory: null };
    }
    return {
        packageName: match[1],
        fromSpec: match[2],
        toSpec: match[3],
        directory: match[4] ?? "/",
    };
}

export function ecosystemFromBranch(branch) {
    const parts = String(branch ?? "").split("/");
    return parts[0] === "dependabot" && parts[1] ? parts[1] : "unknown";
}

function checkState(check) {
    if (check.__typename === "StatusContext") {
        const state = String(check.state ?? "").toUpperCase();
        if (state === "SUCCESS") return "passed";
        if (state === "PENDING" || state === "EXPECTED") return "pending";
        return FAILED_STATES.has(state) || state === "FAILURE" ? "failed" : "pending";
    }
    if (String(check.status ?? "").toUpperCase() !== "COMPLETED") return "pending";
    const conclusion = String(check.conclusion ?? "").toUpperCase();
    if (FAILED_STATES.has(conclusion)) return "failed";
    if (PASSED_STATES.has(conclusion)) return "passed";
    return "pending";
}

export function summarizeChecks(rollup) {
    const latest = new Map();
    for (const check of Array.isArray(rollup) ? rollup : []) {
        const name = check?.name ?? check?.context;
        if (!name) continue;
        const startedAt = check.startedAt ?? check.createdAt ?? "";
        const previous = latest.get(name);
        if (!previous || startedAt >= previous.startedAt) {
            latest.set(name, {
                name,
                startedAt,
                state: checkState(check),
                url: safeGitHubUrl(check.detailsUrl ?? check.targetUrl),
            });
        }
    }
    const checks = [...latest.values()];
    const failed = checks.filter((check) => check.state === "failed");
    const pending = checks.filter((check) => check.state === "pending");
    let state = "none";
    if (failed.length) state = "failing";
    else if (pending.length) state = "pending";
    else if (checks.length) state = "passing";
    return {
        state,
        failed: failed.map(({ name, url }) => ({ name, url })),
        pending: pending.map(({ name }) => name),
        total: checks.length,
    };
}

export function normalizePr(raw) {
    if (!raw || !Number.isInteger(raw.number)) return null;
    const parsed = parseTitle(raw.title);
    const from = pickVersion(parsed.fromSpec);
    const to = pickVersion(parsed.toSpec);
    return {
        number: raw.number,
        title: String(raw.title ?? ""),
        url: safeGitHubUrl(raw.url),
        createdAt: raw.createdAt ?? null,
        branch: String(raw.headRefName ?? ""),
        packageName: parsed.packageName,
        fromSpec: parsed.fromSpec,
        toSpec: parsed.toSpec,
        from,
        to,
        bump: bumpType(from, to),
        ecosystem: ecosystemFromBranch(raw.headRefName),
        directory: parsed.directory,
        ci: summarizeChecks(raw.statusCheckRollup),
        supersededBy: null,
    };
}

// Older PRs for the same package/ecosystem/directory are superseded by the newest one.
export function markSuperseded(prs) {
    const groups = new Map();
    for (const pr of prs) {
        if (!pr.fromSpec) continue;
        const key = `${pr.ecosystem}|${pr.directory}|${pr.packageName}`;
        const group = groups.get(key) ?? [];
        group.push(pr);
        groups.set(key, group);
    }
    for (const group of groups.values()) {
        if (group.length < 2) continue;
        group.sort((a, b) => b.number - a.number);
        for (const older of group.slice(1)) older.supersededBy = group[0].number;
    }
    return prs;
}

export function repoFromUrl(url) {
    const match = String(url ?? "").match(/^https:\/\/github\.com\/([^/\s]+\/[^/\s]+)\/pull\/\d+/);
    return match ? match[1] : null;
}

export async function fetchRepoName(cwd) {
    const out = await runGh(["repo", "view", "--json", "nameWithOwner"], cwd);
    const data = parseJson(out);
    if (typeof data?.nameWithOwner !== "string") {
        throw new GhError("gh_bad_output", "저장소 이름을 읽지 못했습니다.");
    }
    return data.nameWithOwner;
}

export async function fetchDependabotPrs(cwd) {
    const out = await runGh(
        [
            "pr",
            "list",
            "--author",
            "app/dependabot",
            "--state",
            "open",
            "--limit",
            "100",
            "--json",
            "number,title,headRefName,url,createdAt,statusCheckRollup",
        ],
        cwd,
    );
    const raw = parseJson(out);
    if (!Array.isArray(raw)) throw new GhError("gh_bad_output", "PR 목록 형식이 올바르지 않습니다.");
    return markSuperseded(raw.map(normalizePr).filter(Boolean));
}

// Open non-Dependabot PRs that mention a Dependabot PR as "#81" or ".../pull/81".
export function findReferences(prNumbers, candidates) {
    const links = new Map();
    for (const candidate of candidates) {
        if (!Number.isInteger(candidate?.number)) continue;
        if (String(candidate.headRefName ?? "").startsWith("dependabot/")) continue;
        const url = safeGitHubUrl(candidate.url);
        if (!url) continue;
        const text = `${candidate.title ?? ""}\n${candidate.body ?? ""}`;
        for (const number of prNumbers) {
            if (number === candidate.number) continue;
            const pattern = new RegExp(`(?:^|[^\\w/&])#${number}(?!\\d)|/pull/${number}(?!\\d)`);
            if (!pattern.test(text)) continue;
            const list = links.get(number) ?? [];
            list.push({
                number: candidate.number,
                url,
                title: String(candidate.title ?? "").slice(0, 200),
                isDraft: Boolean(candidate.isDraft),
            });
            links.set(number, list);
        }
    }
    return links;
}

export async function fetchFixPrCandidates(cwd) {
    const out = await runGh(
        [
            "pr",
            "list",
            "--state",
            "open",
            "--limit",
            "50",
            "--json",
            "number,title,body,url,isDraft,headRefName",
        ],
        cwd,
    );
    const raw = parseJson(out);
    return Array.isArray(raw) ? raw : [];
}
