import { COLUMNS, COLUMN_IDS } from "./store.mjs";
import {
    GhError,
    fetchDependabotPrs,
    fetchFixPrCandidates,
    fetchRepoName,
    findReferences,
    repoFromUrl,
} from "./github.mjs";
import { findLatestBriefing } from "./briefing.mjs";

const PENDING_TTL_MS = 15 * 60 * 1000;

export class BoardError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.code = code;
        this.status = status;
    }
}

export class Board {
    constructor({ cwd, store, sessionStateRoot, log }) {
        this.cwd = cwd;
        this.store = store;
        this.sessionStateRoot = sessionStateRoot;
        this.log = log;
        this.repo = null;
        this.prs = [];
        this.fixLinks = new Map();
        this.briefing = null;
        this.fetchedAt = null;
        this.error = null;
        this.loading = null;
        this.pending = new Map();
        this.listeners = new Set();
    }

    ensureLoaded() {
        return this.fetchedAt ? Promise.resolve() : this.refresh();
    }

    refresh() {
        if (!this.loading) {
            this.loading = this.#load().finally(() => {
                this.loading = null;
                this.broadcast();
            });
            this.broadcast();
        }
        return this.loading;
    }

    async #load() {
        try {
            const [prs, candidates] = await Promise.all([
                fetchDependabotPrs(this.cwd),
                fetchFixPrCandidates(this.cwd).catch((error) => {
                    this.log?.(`수정 PR 후보를 읽지 못했습니다: ${error.message}`, "warning");
                    return [];
                }),
            ]);
            const repo =
                repoFromUrl(prs[0]?.url) ??
                repoFromUrl(candidates[0]?.url) ??
                (await fetchRepoName(this.cwd));
            await this.store.load();
            this.repo = repo;
            this.prs = prs;
            this.fixLinks = findReferences(
                prs.map((pr) => pr.number),
                candidates,
            );
            this.briefing = await findLatestBriefing(this.sessionStateRoot, repo).catch(() => null);
            this.fetchedAt = new Date().toISOString();
            this.error = null;
        } catch (error) {
            this.error = error instanceof GhError ? error.message : "PR 목록을 불러오지 못했습니다.";
            if (!(error instanceof GhError)) {
                this.log?.(`관제탑을 불러오지 못했습니다: ${error?.message ?? error}`, "error");
            }
            throw new BoardError(error?.code ?? "load_failed", this.error, 502);
        }
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    broadcast() {
        if (!this.listeners.size) return;
        const snapshot = this.snapshot();
        for (const listener of this.listeners) {
            try {
                listener(snapshot);
            } catch {
                this.listeners.delete(listener);
            }
        }
    }

    snapshot() {
        const verdicts = this.repo ? this.store.entries(this.repo) : {};
        const now = Date.now();
        const picks = new Map();
        for (const pick of this.briefing?.picks ?? []) {
            for (const number of pick.prs) {
                if (!picks.has(number)) picks.set(number, { rank: pick.rank, category: pick.category });
            }
        }
        const cards = this.prs.map((pr) => {
            const verdict = verdicts[String(pr.number)] ?? {};
            const fixPrs = [...(this.fixLinks.get(pr.number) ?? [])];
            if (verdict.fixPr && !fixPrs.some((fix) => fix.url === verdict.fixPr)) {
                fixPrs.push({
                    number: Number(verdict.fixPr.match(/\/pull\/(\d+)/)?.[1]),
                    url: verdict.fixPr,
                    title: "",
                    isDraft: null,
                });
            }
            const pendingSince = this.pending.get(pr.number);
            return {
                ...pr,
                column: COLUMN_IDS.includes(verdict.column) ? verdict.column : "inbox",
                reason: verdict.reason ?? null,
                reasonBy: verdict.reasonBy ?? null,
                decidedBy: verdict.by ?? null,
                decidedAt: verdict.updatedAt ?? null,
                fixPrs,
                pending: Boolean(pendingSince && now - pendingSince < PENDING_TTL_MS),
                briefing: picks.get(pr.number) ?? null,
            };
        });
        return {
            repo: this.repo,
            fetchedAt: this.fetchedAt,
            loading: Boolean(this.loading),
            error: this.error,
            columns: COLUMNS.map((column) => ({
                ...column,
                count: cards.filter((card) => card.column === column.id).length,
            })),
            cards,
            briefing: this.briefing,
        };
    }

    agentView(column) {
        const snapshot = this.snapshot();
        return {
            repo: snapshot.repo,
            fetchedAt: snapshot.fetchedAt,
            counts: Object.fromEntries(snapshot.columns.map((entry) => [entry.id, entry.count])),
            briefing: snapshot.briefing,
            prs: snapshot.cards
                .filter((card) => !column || card.column === column)
                .map((card) => ({
                    pr: card.number,
                    package: card.packageName,
                    from: card.from,
                    to: card.to,
                    bump: card.bump,
                    ecosystem: card.ecosystem,
                    directory: card.directory,
                    ci: card.ci.state,
                    failedJobs: card.ci.failed.map((check) => check.name),
                    supersededBy: card.supersededBy,
                    column: card.column,
                    reason: card.reason,
                    decidedBy: card.decidedBy,
                    fixPrs: card.fixPrs.map((fix) => fix.url),
                    todayRank: card.briefing?.rank ?? null,
                    url: card.url,
                })),
        };
    }

    async card(number) {
        await this.ensureLoaded();
        const card = this.snapshot().cards.find((entry) => entry.number === number);
        if (!card) {
            throw new BoardError(
                "unknown_pr",
                `PR #${number}은(는) 관제탑에 없는 PR입니다. 열린 Dependabot PR 번호를 사용하세요.`,
                404,
            );
        }
        return card;
    }

    async setColumn(number, { column, reason, by, fixPr }) {
        if (!COLUMN_IDS.includes(column)) {
            throw new BoardError("invalid_column", `column은 ${COLUMN_IDS.join(", ")} 중 하나여야 합니다.`);
        }
        await this.card(number);
        const patch = { column, by };
        if (reason !== undefined) {
            patch.reason = reason;
            patch.reasonBy = by;
        }
        if (fixPr !== undefined) patch.fixPr = this.#checkFixPr(fixPr);
        await this.store.update(this.repo, number, patch);
        this.pending.delete(number);
        this.broadcast();
        return this.card(number);
    }

    async linkFixPr(number, url) {
        await this.card(number);
        await this.store.update(this.repo, number, { fixPr: this.#checkFixPr(url) });
        this.broadcast();
        return this.card(number);
    }

    #checkFixPr(url) {
        const prefix = `https://github.com/${this.repo}/pull/`;
        if (typeof url !== "string" || !url.startsWith(prefix) || !/^\d+$/.test(url.slice(prefix.length))) {
            throw new BoardError("invalid_fix_pr", `수정 PR은 ${prefix}<번호> 형식이어야 합니다.`);
        }
        return url;
    }

    markPending(number) {
        this.pending.set(number, Date.now());
        this.broadcast();
    }

    clearPending(number) {
        this.pending.delete(number);
        this.broadcast();
    }

    async reset() {
        await this.ensureLoaded();
        await this.store.reset(this.repo);
        this.pending.clear();
        this.broadcast();
    }
}
