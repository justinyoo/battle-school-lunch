import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { COLUMN_IDS } from "./store.mjs";
import { BoardError } from "./board.mjs";
import { renderPage } from "./renderer.mjs";

const MAX_BODY_BYTES = 8 * 1024;
const HEARTBEAT_MS = 20_000;

function sendJson(response, status, body) {
    response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
    });
    response.end(JSON.stringify(body));
}

function readJson(request) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        request.on("data", (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                reject(new BoardError("body_too_large", "요청 본문이 너무 큽니다.", 413));
                request.destroy();
                return;
            }
            chunks.push(chunk);
        });
        request.on("end", () => {
            try {
                resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
            } catch {
                reject(new BoardError("invalid_json", "요청 본문이 올바른 JSON이 아닙니다."));
            }
        });
        request.on("error", reject);
    });
}

function prNumber(body) {
    const number = body?.pr;
    if (!Number.isInteger(number) || number < 1) {
        throw new BoardError("invalid_pr", "pr은 양의 정수여야 합니다.");
    }
    return number;
}

// Only pages of the board's own repository may be opened in the Browser canvas.
function repoLink(value, repo) {
    let url;
    try {
        url = new URL(String(value));
    } catch {
        url = null;
    }
    const prefix = `/${String(repo).toLowerCase()}/`;
    if (!repo || url?.protocol !== "https:" || url.host !== "github.com" || !url.pathname.toLowerCase().startsWith(prefix)) {
        throw new BoardError("invalid_link", "이 저장소의 GitHub 링크만 열 수 있습니다.");
    }
    return url.href;
}

// One loopback server per canvas instance. The random view path and request
// token keep other local pages from reading or changing the board.
export async function startBoardServer({ instanceId, boardPromise, delegate, openLink, log }) {
    const requestToken = randomBytes(32).toString("base64url");
    const viewPath = `/${randomBytes(24).toString("base64url")}/`;
    const clients = new Set();
    let allowedHost = "";

    const routes = {
        "api/move": async (board, body) => {
            const column = body?.column;
            if (!COLUMN_IDS.includes(column)) {
                throw new BoardError("invalid_column", `column은 ${COLUMN_IDS.join(", ")} 중 하나여야 합니다.`);
            }
            await board.setColumn(prNumber(body), { column, by: "user" });
            return { ok: true };
        },
        "api/delegate": async (board, body) => {
            const card = await board.card(prNumber(body));
            if (card.pending) {
                throw new BoardError("already_pending", `PR #${card.number}은(는) 이미 Copilot이 확인하고 있습니다.`, 409);
            }
            board.markPending(card.number);
            try {
                await delegate(card, instanceId);
            } catch (error) {
                board.clearPending(card.number);
                log(`Copilot에게 PR #${card.number}을(를) 보내지 못했습니다: ${error?.message ?? error}`, "error");
                throw new BoardError("delegate_failed", "Copilot에게 요청을 보내지 못했습니다.", 502);
            }
            return { ok: true };
        },
        "api/refresh": async (board) => {
            await board.refresh();
            return { ok: true };
        },
        "api/reset": async (board) => {
            await board.reset();
            return { ok: true };
        },
        "api/open-link": async (board, body) => {
            await board.ensureLoaded();
            const url = repoLink(body?.url, board.repo);
            const title = typeof body?.title === "string" ? body.title.slice(0, 80) : undefined;
            try {
                await openLink(url, title);
            } catch (error) {
                log(`Browser Canvas를 열지 못했습니다: ${error?.message ?? error}`, "warning");
                throw new BoardError("open_failed", "앱 안에서 링크를 열지 못했습니다.", 502);
            }
            return { ok: true };
        },
    };

    async function openEvents(request, response) {
        response.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-store",
            Connection: "keep-alive",
            "X-Content-Type-Options": "nosniff",
        });
        response.write("retry: 2000\n\n");
        const board = await boardPromise;
        const send = (snapshot) => response.write(`event: board\ndata: ${JSON.stringify(snapshot)}\n\n`);
        send(board.snapshot());
        const unsubscribe = board.subscribe(send);
        const heartbeat = setInterval(() => response.write(": ping\n\n"), HEARTBEAT_MS);
        clients.add(response);
        request.on("close", () => {
            clearInterval(heartbeat);
            unsubscribe();
            clients.delete(response);
        });
        board.ensureLoaded().catch(() => {});
    }

    async function handle(request, response) {
        if (request.headers.host !== allowedHost) {
            response.writeHead(400).end("Invalid host");
            return;
        }
        const path = new URL(request.url ?? "/", `http://${allowedHost}`).pathname;
        if (request.method === "GET" && path === "/favicon.ico") {
            response.writeHead(204).end();
            return;
        }
        if (!path.startsWith(viewPath)) {
            response.writeHead(404).end("Not found");
            return;
        }
        const route = path.slice(viewPath.length);

        if (request.method === "GET" && route === "") {
            response.writeHead(200, {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
                "Referrer-Policy": "no-referrer",
            });
            response.end(renderPage({ requestToken }));
            return;
        }
        if (request.method === "GET" && route === "events") {
            await openEvents(request, response);
            return;
        }
        const handler = request.method === "POST" ? routes[route] : undefined;
        if (!handler) {
            response.writeHead(404).end("Not found");
            return;
        }
        if (request.headers["x-canvas-request-token"] !== requestToken) {
            sendJson(response, 403, { error: "Forbidden" });
            return;
        }
        try {
            const body = await readJson(request);
            sendJson(response, 200, await handler(await boardPromise, body));
        } catch (error) {
            if (error instanceof BoardError) {
                sendJson(response, error.status, { error: error.message, code: error.code });
                return;
            }
            log(`관제탑 요청 처리 중 오류: ${error?.message ?? error}`, "error");
            sendJson(response, 500, { error: "요청을 처리하지 못했습니다." });
        }
    }

    const server = createServer((request, response) => {
        handle(request, response).catch((error) => {
            log(`관제탑 서버 오류: ${error?.message ?? error}`, "error");
            if (!response.headersSent) response.writeHead(500);
            response.end();
        });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    allowedHost = `127.0.0.1:${port}`;

    return {
        url: `http://${allowedHost}${viewPath}`,
        close: () =>
            new Promise((resolve) => {
                for (const client of clients) client.end();
                clients.clear();
                server.close(() => resolve());
                server.closeAllConnections?.();
            }),
    };
}
