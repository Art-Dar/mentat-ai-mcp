//npm run check:secrets
import { execFileSync } from "node:child_process";

import { isForbiddenPath, scanText, type Finding } from "./secret-patterns.js";

function git(args: string[]): string {
    return execFileSync("git", args, { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
}

try {
    git(["rev-parse", "--git-dir"]);
} catch {
    console.error("check-secrets: not a git repository. Run it from the repo root.");
    process.exit(2);
}

const findings: (Finding & { commit: string })[] = [];

// 1. Every line ever added, in every commit on every branch.
const log = git(["log", "--all", "-p", "--no-color", "--unified=0", "--format=commit %H"]);
let commit = "";
let file = "";
let newLine = 0;
for (const line of log.split("\n")) {
    if (line.startsWith("commit ")) commit = line.slice(7, 14);
    else if (line.startsWith("+++ ")) file = line.replace(/^\+\+\+ (b\/)?/, "");
    else if (line.startsWith("@@")) newLine = Number(/\+(\d+)/.exec(line)?.[1] ?? 0);
    else if (line.startsWith("+")) {
        for (const f of scanText(line.slice(1), file, newLine - 1)) findings.push({ ...f, commit });
        newLine += 1;
    }
}

// 2. Files that must never have been committed at all.
const paths = git(["log", "--all", "--name-only", "--format=commit %H"]);
for (const line of paths.split("\n")) {
    if (line.startsWith("commit ")) commit = line.slice(7, 14);
    else if (line && isForbiddenPath(line)) findings.push({ kind: "committed env file", file: line, line: 0, preview: "-", commit });
}

// 3. The working tree, including files not committed yet (but not ignored ones).
const tracked = git(["ls-files", "--cached", "--others", "--exclude-standard"]).split("\n").filter(Boolean);
for (const path of tracked) {
    if (isForbiddenPath(path)) findings.push({ kind: "env file not ignored", file: path, line: 0, preview: "-", commit: "worktree" });
}

const unique = [...new Map(findings.map((f) => [`${f.kind}|${f.file}|${f.preview}`, f])).values()];

if (unique.length === 0) {
    console.log("check-secrets: clean. No secrets found in the git history or the working tree.");
    process.exit(0);
}

console.error(`check-secrets: ${unique.length} finding(s). Do NOT make the repo public yet.\n`);
for (const f of unique) {
    console.error(`  [${f.commit}] ${f.file}${f.line ? `:${f.line}` : ""}  ${f.kind}  ${f.preview}`);
}
console.error("\nRotate each real secret first, then remove it from history (see README, Security).");
process.exit(1);