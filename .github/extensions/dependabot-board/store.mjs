import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const COLUMNS = [
    { id: "inbox", label: "미분류" },
    { id: "merge", label: "바로 머지" },
    { id: "fix", label: "수정 필요" },
    { id: "hold", label: "보류" },
];
export const COLUMN_IDS = COLUMNS.map((column) => column.id);
export const columnLabel = (id) => COLUMNS.find((column) => column.id === id)?.label ?? id;

// Board decisions keyed by repository and PR number, so they survive panel
// reloads, `extensions_reload`, and new instanceIds. The file is shared by
// every session (including Automation runs), so each change re-reads it first.
export class VerdictStore {
    constructor(filePath) {
        this.filePath = filePath;
        this.data = { version: 1, repos: {} };
        this.queue = Promise.resolve();
    }

    #serial(task) {
        const run = this.queue.catch(() => {}).then(task);
        this.queue = run;
        return run;
    }

    async #read() {
        try {
            const parsed = JSON.parse(await readFile(this.filePath, "utf8"));
            if (parsed?.version === 1 && parsed.repos && typeof parsed.repos === "object") {
                this.data = parsed;
            }
        } catch (error) {
            if (error?.code === "ENOENT") this.data = { version: 1, repos: {} };
        }
    }

    async #write() {
        await mkdir(dirname(this.filePath), { recursive: true });
        const temp = `${this.filePath}.${process.pid}.tmp`;
        await writeFile(temp, JSON.stringify(this.data, null, 2), "utf8");
        await rename(temp, this.filePath);
    }

    load() {
        return this.#serial(() => this.#read());
    }

    entries(repo) {
        return this.data.repos[repo]?.prs ?? {};
    }

    update(repo, number, patch) {
        return this.#serial(async () => {
            await this.#read();
            const repoState = (this.data.repos[repo] ??= { prs: {} });
            const key = String(number);
            repoState.prs[key] = {
                ...(repoState.prs[key] ?? {}),
                ...patch,
                updatedAt: new Date().toISOString(),
            };
            await this.#write();
            return repoState.prs[key];
        });
    }

    reset(repo) {
        return this.#serial(async () => {
            await this.#read();
            delete this.data.repos[repo];
            await this.#write();
        });
    }
}
