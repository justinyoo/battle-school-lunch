import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

// The dependabot-briefing skill saves this file in its own session folder.
// Automations run in their own sessions, so the board scans every session.
export const BRIEFING_RELATIVE_PATH = ["files", "dependabot-board", "briefing.json"];
const MAX_BYTES = 64 * 1024;
const MAX_PICKS = 5;

function text(value, max) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function validateBriefing(data, repo) {
    if (!data || data.version !== 1) return null;
    if (typeof data.repo !== "string" || data.repo.toLowerCase() !== String(repo).toLowerCase()) return null;
    if (typeof data.generatedAt !== "string" || Number.isNaN(Date.parse(data.generatedAt))) return null;
    if (!Array.isArray(data.picks)) return null;
    const picks = data.picks
        .slice(0, MAX_PICKS)
        .map((pick, index) => {
            const prs = (Array.isArray(pick?.prs) ? pick.prs : [pick?.pr])
                .filter((number) => Number.isInteger(number) && number > 0)
                .slice(0, 20);
            if (!prs.length) return null;
            return {
                rank: Number.isInteger(pick.rank) && pick.rank > 0 ? pick.rank : index + 1,
                prs,
                category: text(pick.category, 40),
                summary: text(pick.summary, 200),
            };
        })
        .filter(Boolean);
    return picks.length ? { generatedAt: data.generatedAt, picks } : null;
}

export async function findLatestBriefing(sessionStateRoot, repo) {
    let entries;
    try {
        entries = await readdir(sessionStateRoot, { withFileTypes: true });
    } catch {
        return null;
    }
    const candidates = [];
    await Promise.all(
        entries
            .filter((entry) => entry.isDirectory())
            .map(async (entry) => {
                const path = join(sessionStateRoot, entry.name, ...BRIEFING_RELATIVE_PATH);
                try {
                    const info = await stat(path);
                    if (info.isFile() && info.size <= MAX_BYTES) {
                        candidates.push({ path, mtimeMs: info.mtimeMs });
                    }
                } catch {
                    // No briefing in this session.
                }
            }),
    );
    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
    for (const candidate of candidates.slice(0, 10)) {
        try {
            const briefing = validateBriefing(JSON.parse(await readFile(candidate.path, "utf8")), repo);
            if (briefing) return briefing;
        } catch {
            // Ignore unreadable or malformed files and try the next newest.
        }
    }
    return null;
}
