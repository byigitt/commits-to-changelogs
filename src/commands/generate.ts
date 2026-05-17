import { basename } from "node:path";
import { confirm, intro, isCancel, log, note, outro, spinner } from "@clack/prompts";
import pc from "picocolors";
import {
  type Config,
  PROVIDER_DEFAULTS,
  PROVIDER_IDS,
  type ProviderId,
  STYLE_IDS,
  type StyleId,
  loadConfig,
  resolveProviderCreds,
} from "../core/config.js";
import { ProviderError, getProvider } from "../providers/index.js";
import {
  type ParsedCommit,
  filterCommits,
  getLatestTag,
  getRemoteUrl,
  getRepoRoot,
  isGitRepo,
  listCommits,
  resolveRange,
} from "../core/git.js";
import { formatDate, readExistingChangelog, writeChangelog } from "../core/changelog.js";
import { buildSystemPrompt, buildUserPrompt } from "../core/prompts.js";

export interface GenerateFlags {
  from?: string;
  to?: string;
  output?: string;
  style?: StyleId;
  version?: string;
  unreleased?: boolean;
  dryRun?: boolean;
  yes?: boolean;
  provider?: ProviderId;
  model?: string;
  stream?: boolean;
}

const FALLBACK_LIMIT = 50;

function repoNameFromRemote(remote: string | null, cwd: string): string {
  if (remote) {
    const cleaned = remote.replace(/\.git$/, "");
    const parts = cleaned.split(/[/:]/).filter(Boolean);
    if (parts.length >= 2) return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
  }
  return basename(cwd);
}

function summarizeCommits(commits: ParsedCommit[]): string {
  const byType: Record<string, number> = {};
  for (const c of commits) {
    const key = c.type ?? "other";
    byType[key] = (byType[key] ?? 0) + 1;
  }
  const parts = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${pc.bold(String(v))} ${pc.dim(k)}`);
  return parts.join("  ");
}

export async function runGenerate(flags: GenerateFlags): Promise<void> {
  intro(pc.bold(pc.magenta("ctc")) + pc.dim(" · generate"));

  const cwd = process.cwd();
  if (!isGitRepo(cwd)) {
    log.error("not inside a git repository");
    outro(pc.red("aborted"));
    process.exit(1);
  }

  const repoRoot = getRepoRoot(cwd);
  const { config, sources } = loadConfig(repoRoot);

  const providerId: ProviderId = flags.provider ?? config.defaultProvider;
  if (!PROVIDER_IDS.includes(providerId)) {
    log.error(`unknown provider: ${providerId}`);
    outro(pc.red("aborted"));
    process.exit(1);
  }

  const style: StyleId = flags.style ?? config.style;
  if (!STYLE_IDS.includes(style)) {
    log.error(`unknown style: ${style}`);
    outro(pc.red("aborted"));
    process.exit(1);
  }

  const output = flags.output ?? config.output;
  const existingChangelog = readExistingChangelog(output, repoRoot);

  const range = resolveRange({
    cwd: repoRoot,
    from: flags.from,
    to: flags.to,
    changelogText: existingChangelog ?? undefined,
    fallbackLimit: FALLBACK_LIMIT,
  });

  const commits = listCommits({
    cwd: repoRoot,
    from: range.from ?? undefined,
    to: range.to,
    limit: range.from ? undefined : FALLBACK_LIMIT,
  });

  const filtered = filterCommits(commits, config.ignore);

  note(
    [
      `${pc.bold("provider:")} ${PROVIDER_DEFAULTS[providerId].label}`,
      `${pc.bold("model:")}    ${flags.model ?? resolveProviderCreds(config, providerId).model}`,
      `${pc.bold("style:")}    ${style}`,
      `${pc.bold("output:")}   ${output}`,
      `${pc.bold("range:")}    ${range.reason} → ${range.to}`,
      `${pc.bold("commits:")}  ${filtered.length} kept (${commits.length} total)`,
      sources.project ? pc.dim(`project config: ${sources.project}`) : "",
    ]
      .filter(Boolean)
      .join("\n"),
    "context",
  );

  if (filtered.length === 0) {
    log.warn("no commits to include — nothing to do");
    outro(pc.yellow("done"));
    return;
  }

  if (filtered.length <= 8) {
    note(
      filtered
        .slice(0, 8)
        .map((c) => `${pc.dim(c.shortHash)}  ${c.subject}`)
        .join("\n"),
      "preview",
    );
  } else {
    log.message(summarizeCommits(filtered));
  }

  if (!flags.yes && !flags.dryRun) {
    const ok = await confirm({
      message: `generate changelog for ${filtered.length} commits?`,
      initialValue: true,
    });
    if (isCancel(ok) || ok === false) {
      outro(pc.yellow("cancelled"));
      return;
    }
  }

  let provider;
  try {
    provider = getProvider(config, providerId);
  } catch (err) {
    if (err instanceof ProviderError) {
      log.error(err.message);
      if (err.hint) log.message(pc.dim(`hint: ${err.hint}`));
      outro(pc.red("aborted"));
      process.exit(1);
    }
    throw err;
  }

  const repoName = repoNameFromRemote(getRemoteUrl(repoRoot), repoRoot);
  const latestTag = getLatestTag(repoRoot);
  const versionLabel = flags.version ?? (flags.unreleased ? "Unreleased" : latestTag ?? "Unreleased");
  const rangeLabel = range.from ? `${range.from}..${range.to}` : `last ${filtered.length} commits`;

  const messages = [
    { role: "system" as const, content: buildSystemPrompt(style) },
    {
      role: "user" as const,
      content: buildUserPrompt({
        commits: filtered,
        repoName,
        version: versionLabel,
        rangeLabel,
      }),
    },
  ];

  const wantStream = flags.stream !== false;
  const spin = spinner();
  let buffer = "";
  let streamedOnce = false;

  if (!wantStream) spin.start(`asking ${provider.label}...`);

  try {
    const result = await provider.generate({
      messages,
      model: flags.model ?? provider.defaultModel,
      temperature: 0.4,
      maxTokens: 2048,
      stream: wantStream,
      onToken(chunk) {
        if (!streamedOnce) {
          process.stdout.write("\n" + pc.dim("──── streaming ────\n"));
          streamedOnce = true;
        }
        buffer += chunk;
        process.stdout.write(chunk);
      },
    });
    if (!wantStream) spin.stop("response received");
    if (streamedOnce) process.stdout.write("\n" + pc.dim("───────────────────\n"));
    const text = (result.text || buffer).trim();
    if (!text) {
      log.error("provider returned empty output");
      outro(pc.red("aborted"));
      process.exit(1);
    }

    if (flags.dryRun) {
      note(text, "dry-run output");
      outro(pc.green("done (nothing written)"));
      return;
    }

    const newestSha = filtered[0]?.hash ?? "";
    const path = writeChangelog({
      output,
      cwd: repoRoot,
      body: text,
      versionLabel,
      date: formatDate(),
      newestSha,
    });
    log.success(`updated ${pc.cyan(path)}`);
    outro(pc.green("done"));
  } catch (err) {
    if (!wantStream) spin.stop("failed");
    if (err instanceof ProviderError) {
      log.error(err.message);
      if (err.hint) log.message(pc.dim(`hint: ${err.hint}`));
    } else {
      log.error(err instanceof Error ? err.message : String(err));
    }
    outro(pc.red("aborted"));
    process.exit(1);
  }
}

export function validateProviderFlag(value: string): ProviderId {
  if ((PROVIDER_IDS as readonly string[]).includes(value)) return value as ProviderId;
  throw new Error(`invalid provider: ${value}. one of ${PROVIDER_IDS.join(", ")}`);
}

export function validateStyleFlag(value: string): StyleId {
  if ((STYLE_IDS as readonly string[]).includes(value)) return value as StyleId;
  throw new Error(`invalid style: ${value}. one of ${STYLE_IDS.join(", ")}`);
}

export function describeConfig(config: Config): string {
  return JSON.stringify(config, null, 2);
}
