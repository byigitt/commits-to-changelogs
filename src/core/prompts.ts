import type { ParsedCommit } from "./git.js";
import type { StyleId } from "./config.js";

const STYLE_INSTRUCTIONS: Record<StyleId, string> = {
  keepachangelog: [
    'Use the "Keep a Changelog" style.',
    "Group entries under these headings, in this order, omitting empty ones:",
    "Added, Changed, Deprecated, Removed, Fixed, Security.",
    'Map conventional-commit types: feat → Added; fix → Fixed; perf/refactor → Changed; revert → Removed; security/sec → Security; deprecate → Deprecated.',
    "If a commit is marked BREAKING (! or BREAKING CHANGE), call it out in **bold** at the start of the bullet.",
  ].join(" "),
  conventional: [
    "Group entries by conventional-commit type using these h3 headings:",
    "Features, Bug Fixes, Performance, Refactoring, Documentation, Tests, Build, CI, Chores, Reverts.",
    "If a commit is breaking, prefix the bullet with **BREAKING:**.",
  ].join(" "),
  minimal: [
    "Output a single flat unordered bullet list — no sub-sections.",
    "One concise sentence per change. Skip trivia like dependency bumps unless meaningful.",
  ].join(" "),
};

export function buildSystemPrompt(style: StyleId): string {
  return [
    "You are a senior release manager writing a changelog for end users.",
    "Rewrite the provided git commits as a polished, human-readable Markdown changelog section.",
    STYLE_INSTRUCTIONS[style],
    "",
    "Rules:",
    "- Write in clear, plain English. Use the imperative or past tense consistently within the section.",
    "- Each bullet must be a complete sentence ending without trailing whitespace.",
    "- Reference the commit using its short SHA in backticks at the end of each bullet, like ` (abc1234)`.",
    "- Merge duplicate or trivial commits (typos, formatting tweaks) into a single line, or drop them.",
    "- Do NOT invent changes that aren't in the commits.",
    "- Do NOT include a top-level `# Changelog` heading. Do NOT include a version header (e.g. `## [1.0.0]`). The caller adds those.",
    "- Start your response directly with the first sub-heading (e.g. `### Added`) or the first bullet for minimal style.",
    "- No preamble, no closing remarks, no code fences around the whole output.",
  ].join("\n");
}

export function buildUserPrompt(args: {
  commits: ParsedCommit[];
  repoName?: string;
  version?: string;
  rangeLabel?: string;
}): string {
  const { commits, repoName, version, rangeLabel } = args;
  const lines: string[] = [];
  lines.push("Project: " + (repoName ?? "(unknown)"));
  if (version) lines.push("Version: " + version);
  if (rangeLabel) lines.push("Range: " + rangeLabel);
  lines.push(`Total commits: ${commits.length}`);
  lines.push("");
  lines.push("Commits (one per line, format `<short> [type(scope)!] subject — body summary`):");
  for (const c of commits) {
    const typeTag = c.type
      ? ` [${c.type}${c.scope ? `(${c.scope})` : ""}${c.breaking ? "!" : ""}]`
      : "";
    const bodyOneLine = c.body ? ` — ${c.body.replace(/\s+/g, " ").slice(0, 240)}` : "";
    lines.push(`- ${c.shortHash}${typeTag} ${c.subject}${bodyOneLine}`);
  }
  lines.push("");
  lines.push("Write the changelog section now.");
  return lines.join("\n");
}
