// Extension: dependabot-board
// Dependabot 관제탑: 열린 Dependabot PR을 카드로 보고 미분류/바로 머지/수정 필요/보류로 결정하는 보드.
// Data and HTTP plumbing live in sibling modules; this file only wires the canvas.

import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { joinSession, createCanvas, CanvasError } from "@github/copilot-sdk/extension";
import { COLUMNS, COLUMN_IDS, VerdictStore, columnLabel } from "./store.mjs";
import { Board, BoardError } from "./board.mjs";
import { buildDelegatePrompt } from "./prompt.mjs";
import { startBoardServer } from "./server.mjs";

const TITLE = "Dependabot 관제탑";
const PR_SCHEMA = { type: "integer", minimum: 1, description: "Dependabot PR number shown on the board" };
const FIX_PR_SCHEMA = {
    type: "string",
    pattern: "^https://github\\.com/[^/\\s]+/[^/\\s]+/pull/\\d+$",
    description: "URL of the pull request that fixes this Dependabot PR",
};

let resolveSession;
// Never await this inside open(): a rehydrate open can arrive before joinSession resolves.
const sessionReady = new Promise((done) => {
    resolveSession = done;
});
const servers = new Map();
const boards = new Map();
let store = null;

function log(message, level = "info") {
    sessionReady.then((session) => session.log(message, { level })).catch(() => {});
}

function resolveCwd(ctx) {
    return resolve(ctx.session?.workingDirectory || process.cwd());
}

// Verdicts are per user, not per session: the dependabot-fix skill reads the
// "수정 필요" column from this file in its own Automation session.
async function storageLocations() {
    const session = await sessionReady;
    const copilotHome = process.env.COPILOT_HOME || join(homedir(), ".copilot");
    return {
        statePath: join(copilotHome, "extensions", "dependabot-board", "artifacts", "state.json"),
        sessionStateRoot: session.workspacePath
            ? dirname(session.workspacePath)
            : join(copilotHome, "session-state"),
    };
}

function getBoard(cwd) {
    let promise = boards.get(cwd);
    if (!promise) {
        promise = storageLocations().then(({ statePath, sessionStateRoot }) => {
            store ??= new VerdictStore(statePath);
            return new Board({ cwd, store, sessionStateRoot, log });
        });
        promise.catch(() => boards.delete(cwd));
        boards.set(cwd, promise);
    }
    return promise;
}

async function delegate(card, instanceId) {
    const session = await sessionReady;
    await session.send({ prompt: buildDelegatePrompt(card, instanceId) });
}

// Opens GitHub links (CI logs) in the app's built-in Browser canvas instead of
// the external browser. Reusing one instanceId navigates the same panel.
async function openInBrowserCanvas(url, title) {
    const session = await sessionReady;
    await session.rpc.canvas.open({
        canvasId: "browser",
        instanceId: "dependabot-board-link",
        input: { url, title, placement: { focus: true } },
    });
}

function action(run) {
    return async (ctx) => {
        try {
            return await run(await getBoard(resolveCwd(ctx)), ctx.input ?? {});
        } catch (error) {
            if (error instanceof BoardError) throw new CanvasError(error.code, error.message);
            throw error;
        }
    };
}

const session = await joinSession({
    canvases: [
        createCanvas({
            id: "dependabot-board",
            displayName: TITLE,
            description:
                "Dependabot 관제탑: kanban board of the repo's open Dependabot PRs (version change, failing CI jobs, morning briefing picks) to sort into 미분류/바로 머지/수정 필요/보류.",
            inputSchema: { type: "object", additionalProperties: false, properties: {} },
            actions: [
                {
                    name: "get_board",
                    description:
                        "Read the board: every open Dependabot PR with its column, version change, bump type, failing CI jobs, reason, and linked fix PRs.",
                    inputSchema: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            column: { type: "string", enum: COLUMN_IDS, description: "Only return cards in this column" },
                        },
                    },
                    handler: action(async (board, input) => {
                        await board.ensureLoaded();
                        return {
                            columnLabels: Object.fromEntries(COLUMNS.map((column) => [column.id, column.label])),
                            ...board.agentView(input.column),
                        };
                    }),
                },
                {
                    name: "refresh",
                    description: "Reload open Dependabot PRs, CI results, linked fix PRs, and the latest briefing from GitHub.",
                    inputSchema: { type: "object", additionalProperties: false, properties: {} },
                    handler: action(async (board) => {
                        await board.refresh();
                        return { ok: true, counts: board.agentView().counts };
                    }),
                },
                {
                    name: "set_verdict",
                    description:
                        "Move a PR card to a column with a one-line reason. Use merge for safe updates, fix when code changes are needed, hold when it should wait.",
                    inputSchema: {
                        type: "object",
                        additionalProperties: false,
                        required: ["pr", "column", "reason"],
                        properties: {
                            pr: PR_SCHEMA,
                            column: { type: "string", enum: COLUMN_IDS },
                            reason: {
                                type: "string",
                                minLength: 1,
                                maxLength: 200,
                                description: "Short Korean reason shown on the card, e.g. \"[호환성 깨짐] mcp 2.x에서 ... 제거\"",
                            },
                            fixPr: FIX_PR_SCHEMA,
                        },
                    },
                    handler: action(async (board, input) => {
                        const card = await board.setColumn(input.pr, {
                            column: input.column,
                            reason: input.reason.trim(),
                            by: "copilot",
                            fixPr: input.fixPr,
                        });
                        return { ok: true, pr: card.number, column: card.column, columnLabel: columnLabel(card.column) };
                    }),
                },
                {
                    name: "link_fix_pr",
                    description: "Attach a fix pull request URL to a Dependabot PR card.",
                    inputSchema: {
                        type: "object",
                        additionalProperties: false,
                        required: ["pr", "url"],
                        properties: { pr: PR_SCHEMA, url: FIX_PR_SCHEMA },
                    },
                    handler: action(async (board, input) => {
                        const card = await board.linkFixPr(input.pr, input.url);
                        return { ok: true, pr: card.number, fixPrs: card.fixPrs.map((fix) => fix.url) };
                    }),
                },
                {
                    name: "open_ci_log",
                    description:
                        "Open a Dependabot PR's failing CI job log inside the app (the Browser canvas the board reuses, which keeps the GitHub sign-in). Use this whenever the user asks to see a CI log in the app.",
                    inputSchema: {
                        type: "object",
                        additionalProperties: false,
                        required: ["pr"],
                        properties: {
                            pr: PR_SCHEMA,
                            check: { type: "string", description: "Failing job name such as Python; defaults to the first failing job" },
                        },
                    },
                    handler: action(async (board, input) => {
                        await board.ensureLoaded();
                        const card = await board.card(input.pr);
                        const failed = card.ci.failed.filter((check) => check.url);
                        const target = input.check
                            ? failed.find((check) => check.name.toLowerCase() === input.check.toLowerCase())
                            : failed[0];
                        if (!target) {
                            throw new CanvasError(
                                "no_failing_log",
                                `PR #${card.number}에 열 수 있는 실패 로그가 없습니다. 실패한 job: ${failed.map((check) => check.name).join(", ") || "없음"}`,
                            );
                        }
                        await openInBrowserCanvas(target.url, `#${card.number} ${target.name} 로그`);
                        return { ok: true, pr: card.number, check: target.name, url: target.url };
                    }),
                },
                {
                    name: "reset_board",
                    description: "Move every card back to 미분류 and clear reasons. Only use when the user explicitly asks to reset.",
                    inputSchema: { type: "object", additionalProperties: false, properties: {} },
                    handler: action(async (board) => {
                        await board.reset();
                        return { ok: true };
                    }),
                },
            ],
            open: async (ctx) => {
                const cwd = resolveCwd(ctx);
                const boardPromise = getBoard(cwd);
                let entry = servers.get(ctx.instanceId);
                if (!entry) {
                    entry = startBoardServer({
                        instanceId: ctx.instanceId,
                        boardPromise,
                        delegate,
                        openLink: openInBrowserCanvas,
                        log,
                    });
                    entry.catch(() => servers.delete(ctx.instanceId));
                    servers.set(ctx.instanceId, entry);
                }
                const { url } = await entry;
                boardPromise.then((board) => board.ensureLoaded()).catch(() => {});
                return { title: TITLE, url };
            },
            onClose: async (ctx) => {
                const entry = servers.get(ctx.instanceId);
                servers.delete(ctx.instanceId);
                if (entry) await (await entry).close();
            },
        }),
    ],
});

resolveSession(session);
