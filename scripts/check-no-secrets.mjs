#!/usr/bin/env node
/**
 * CI guard, same spirit as claude-synapse's check-no-personal-data.mjs:
 * a repeatable, automatic check instead of relying on remembering to look
 * before every push. Scans every git-TRACKED file (never node_modules/dist,
 * never untracked local credential files) for two failure modes:
 *   1. one of the credential filenames itself got committed (should be
 *      structurally impossible per src/config.ts, but "should be" isn't a
 *      test — this is the test)
 *   2. a real Google OAuth client secret or refresh token pattern shows up
 *      inline in a tracked file (e.g. pasted into a commit message fixture,
 *      a README example, a test file)
 */
import { execFileSync } from "node:child_process";

const FORBIDDEN_FILENAMES = ["oauth-keys.json", "credentials.json", "gcp-oauth.keys.json", ".gtasks-server-credentials.json"];

// GOCSPX- : current Google OAuth client secret prefix.
// 1//     : current Google OAuth refresh token prefix.
const SECRET_PATTERNS = [/GOCSPX-[A-Za-z0-9_-]+/, /\b1\/\/[A-Za-z0-9_-]{20,}/];

function trackedFiles() {
  return execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
}

const files = trackedFiles();
const findings = [];

for (const file of files) {
  const base = file.split("/").pop() ?? file;
  if (FORBIDDEN_FILENAMES.includes(base)) {
    findings.push(`[credential filename tracked] ${file}`);
  }
}

let content;
try {
  content = execFileSync("git", ["grep", "-n", "-E", SECRET_PATTERNS.map((r) => r.source).join("|")], { encoding: "utf8" });
} catch {
  content = ""; // git grep exits 1 when nothing matches — that's the success case here
}
if (content.trim()) {
  for (const line of content.trim().split("\n")) {
    findings.push(`[secret-shaped string] ${line}`);
  }
}

if (findings.length > 0) {
  console.error(`check-no-secrets: ${findings.length} finding(s):`);
  for (const f of findings) console.error(`  ${f}`);
  process.exitCode = 1;
} else {
  console.log("check-no-secrets: clean.");
}
