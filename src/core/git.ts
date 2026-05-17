import { execFileSync } from "node:child_process";

export interface ParsedCommit {
  hash: string;
  shortHash: string;
  subject: string;
  body: string;
  author: string;
  email: string;
  date: string;
  type?: string;
  scope?: string;
  breaking: boolean;
}

const RECORD_SEP = "\x1e";
const FIELD_SEP = "\x1f";

function git(args: string[], cwd: string = process.cwd()): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64,
    stdio: ["ignore", "pipe", "pipe"],
  }).toString();
}

function safeGit(args: string[], cwd: string = process.cwd()): string | null {
  try {
    return git(args, cwd);
  } catch {
    return null;
  }
}

export function isGitRepo(cwd: string = process.cwd()): boolean {
  return safeGit(["rev-parse", "--is-inside-work-tree"], cwd)?.trim() === "true";
}

export function getRepoRoot(cwd: string = process.cwd()): string {
  const out = safeGit(["rev-parse", "--show-toplevel"], cwd);
  if (!out) throw new Error("not inside a git repository");
  return out.trim();
}

export function getLatestTag(cwd: string = process.cwd()): string | null {
  const out = safeGit(["describe", "--tags", "--abbrev=0"], cwd);
  return out ? out.trim() : null;
}

export function getRemoteUrl(cwd: string = process.cwd()): string | null {
  const out = safeGit(["config", "--get", "remote.origin.url"], cwd);
  return out ? out.trim() : null;
}

export function commitExists(ref: string, cwd: string = process.cwd()): boolean {
  return safeGit(["cat-file", "-e", `${ref}^{commit}`], cwd) !== null;
}

const CONVENTIONAL = /^(?<type>[a-zA-Z]+)(?:\((?<scope>[^)]+)\))?(?<bang>!)?:\s*(?<subject>.+)$/;

function parseConventional(subject: string): {
  type?: string;
  scope?: string;
  subject: string;
  breaking: boolean;
} {
  const match = CONVENTIONAL.exec(subject);
  if (!match || !match.groups) return { subject, breaking: false };
  return {
    type: match.groups.type?.toLowerCase(),
    scope: match.groups.scope,
    subject: match.groups.subject ?? subject,
    breaking: !!match.groups.bang,
  };
}

export interface GitLogOptions {
  from?: string;
  to?: string;
  limit?: number;
  cwd?: string;
  includeMerges?: boolean;
}

export function listCommits(opts: GitLogOptions = {}): ParsedCommit[] {
  const cwd = opts.cwd ?? process.cwd();
  const range = opts.from && opts.to
    ? `${opts.from}..${opts.to}`
    : opts.from
      ? `${opts.from}..HEAD`
      : opts.to
        ? opts.to
        : null;

  const args = [
    "log",
    `--pretty=format:%H${FIELD_SEP}%h${FIELD_SEP}%s${FIELD_SEP}%an${FIELD_SEP}%ae${FIELD_SEP}%aI${FIELD_SEP}%b${RECORD_SEP}`,
  ];
  if (!opts.includeMerges) args.push("--no-merges");
  if (opts.limit) args.push(`-n${opts.limit}`);
  if (range) args.push(range);

  const raw = safeGit(args, cwd) ?? "";
  if (!raw.trim()) return [];

  return raw
    .split(RECORD_SEP)
    .map((entry) => entry.replace(/^\n+/, "").trim())
    .filter(Boolean)
    .map((entry): ParsedCommit | null => {
      const parts = entry.split(FIELD_SEP);
      if (parts.length < 6) return null;
      const [hash, shortHash, subject, author, email, date, ...rest] = parts;
      if (!hash || !shortHash || !subject || !author || !email || !date) return null;
      const body = rest.join(FIELD_SEP).trim();
      const breakingFromBody = /^BREAKING[\s-]CHANGE:/im.test(body);
      const conv = parseConventional(subject);
      return {
        hash,
        shortHash,
        subject: conv.subject,
        body,
        author,
        email,
        date,
        type: conv.type,
        scope: conv.scope,
        breaking: conv.breaking || breakingFromBody,
      };
    })
    .filter((c): c is ParsedCommit => c !== null);
}

export interface RangeResolution {
  from: string | null;
  to: string;
  source: "explicit" | "marker" | "tag" | "fallback";
  reason: string;
}

const MARKER_RE = /<!--\s*ctc:last\s+([0-9a-f]{7,40})\s*-->/i;

export function findLastShaMarker(text: string): string | null {
  const m = MARKER_RE.exec(text);
  return m && m[1] ? m[1] : null;
}

export function resolveRange(args: {
  cwd?: string;
  from?: string;
  to?: string;
  changelogText?: string;
  fallbackLimit?: number;
}): RangeResolution {
  const cwd = args.cwd ?? process.cwd();
  const to = args.to ?? "HEAD";

  if (args.from) {
    if (!commitExists(args.from, cwd)) {
      throw new Error(`--from ref not found: ${args.from}`);
    }
    return { from: args.from, to, source: "explicit", reason: `--from=${args.from}` };
  }

  if (args.changelogText) {
    const marker = findLastShaMarker(args.changelogText);
    if (marker && commitExists(marker, cwd)) {
      return { from: marker, to, source: "marker", reason: `last ctc marker ${marker.slice(0, 7)}` };
    }
  }

  const tag = getLatestTag(cwd);
  if (tag) {
    return { from: tag, to, source: "tag", reason: `last tag ${tag}` };
  }

  return {
    from: null,
    to,
    source: "fallback",
    reason: `no tag or marker — using last ${args.fallbackLimit ?? 50} commits`,
  };
}

export function filterCommits(commits: ParsedCommit[], ignorePatterns: string[]): ParsedCommit[] {
  if (ignorePatterns.length === 0) return commits;
  const regexes = ignorePatterns.map((p) => {
    try {
      return new RegExp(p);
    } catch {
      return null;
    }
  }).filter((r): r is RegExp => r !== null);
  return commits.filter((c) => {
    const subject = c.type
      ? `${c.type}${c.scope ? `(${c.scope})` : ""}: ${c.subject}`
      : c.subject;
    return !regexes.some((re) => re.test(subject));
  });
}

export function groupCommits(
  commits: ParsedCommit[],
  by: "type" | "scope" | "none",
): Record<string, ParsedCommit[]> {
  if (by === "none") return { all: commits };
  const out: Record<string, ParsedCommit[]> = {};
  for (const c of commits) {
    const key = by === "type" ? c.type ?? "other" : c.scope ?? "general";
    if (!out[key]) out[key] = [];
    out[key].push(c);
  }
  return out;
}
