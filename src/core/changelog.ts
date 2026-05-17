import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export interface WriteChangelogArgs {
  output: string;
  cwd: string;
  body: string;
  versionLabel: string;
  date: string;
  newestSha: string;
}

const DEFAULT_HEADER = `# Changelog\n\nAll notable changes to this project are documented in this file.\n\nThis project follows [Keep a Changelog](https://keepachangelog.com) and [Semantic Versioning](https://semver.org).\n\n`;

const MARKER_RE = /<!--\s*ctc:last\s+([0-9a-f]{7,40})\s*-->\n?/gi;

function stripExistingMarker(text: string): string {
  return text.replace(MARKER_RE, "");
}

export function readExistingChangelog(output: string, cwd: string): string | null {
  const path = resolve(cwd, output);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

export function buildSection(args: {
  versionLabel: string;
  date: string;
  body: string;
}): string {
  const trimmed = args.body.trim();
  return `## [${args.versionLabel}] — ${args.date}\n\n${trimmed}\n`;
}

export function composeChangelog(args: WriteChangelogArgs): string {
  const path = resolve(args.cwd, args.output);
  const existing = existsSync(path) ? readFileSync(path, "utf8") : null;
  const section = buildSection({
    versionLabel: args.versionLabel,
    date: args.date,
    body: args.body,
  });
  const marker = `\n<!-- ctc:last ${args.newestSha} -->\n`;

  if (!existing) {
    return `${DEFAULT_HEADER}${section}${marker}`;
  }

  const cleaned = stripExistingMarker(existing).trimEnd();
  const lines = cleaned.split("\n");
  const insertAt = findInsertIndex(lines);
  const before = lines.slice(0, insertAt).join("\n");
  const after = lines.slice(insertAt).join("\n");
  const prefix = before ? `${before}\n\n` : "";
  const suffix = after ? `\n${after}\n` : "\n";
  return `${prefix}${section}${suffix}${marker}`;
}

function findInsertIndex(lines: string[]): number {
  let topHeadingEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^##\s+/.test(line)) {
      return i;
    }
    if (/^#\s+/.test(line)) {
      topHeadingEnd = i;
    }
  }
  if (topHeadingEnd >= 0) return topHeadingEnd + 1;
  return lines.length;
}

export function writeChangelog(args: WriteChangelogArgs): string {
  const path = resolve(args.cwd, args.output);
  const content = composeChangelog(args);
  writeFileSync(path, content, "utf8");
  return path;
}

export function formatDate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
