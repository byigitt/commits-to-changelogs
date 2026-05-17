import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import pc from "picocolors";
import {
  type Config,
  PROVIDER_DEFAULTS,
  PROVIDER_IDS,
  STYLE_IDS,
  USER_CONFIG_PATH,
  getProjectConfigPath,
  loadConfig,
  saveProjectConfig,
  saveUserConfig,
} from "../core/config.js";

function getDottedPath(obj: unknown, dotted: string): unknown {
  const parts = dotted.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

function setDottedPath(obj: Record<string, unknown>, dotted: string, value: unknown): void {
  const parts = dotted.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (!k) continue;
    const next = cur[k];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      cur[k] = {};
    }
    cur = cur[k] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1];
  if (!last) return;
  cur[last] = value;
}

function coerceValue(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  if (raw.startsWith("[") || raw.startsWith("{")) {
    try {
      return JSON.parse(raw);
    } catch {
      // fall back to string
    }
  }
  return raw;
}

function maskKey(key?: string): string {
  if (!key) return pc.dim("∅ not set");
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 4)}${"•".repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`;
}

function redactConfig(config: Config): Config {
  const next = structuredClone(config);
  for (const id of PROVIDER_IDS) {
    const creds = next.providers[id];
    if (creds?.apiKey) {
      next.providers[id] = { ...creds, apiKey: maskKey(creds.apiKey) };
    }
  }
  return next;
}

export function runConfigGet(key?: string): void {
  const { config, sources } = loadConfig();
  if (!key) {
    console.log(pc.dim(`# user:    ${sources.user ? USER_CONFIG_PATH : "(none)"}`));
    console.log(pc.dim(`# project: ${sources.project ?? "(none)"}`));
    console.log(JSON.stringify(redactConfig(config), null, 2));
    return;
  }
  const value = getDottedPath(redactConfig(config), key);
  if (value === undefined) {
    console.log(pc.dim("(unset)"));
    process.exit(1);
  }
  console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

export function runConfigSet(key: string, rawValue: string, scope: "user" | "project"): void {
  const { config } = loadConfig();
  const next = structuredClone(config) as unknown as Record<string, unknown>;
  setDottedPath(next, key, coerceValue(rawValue));
  if (scope === "project") {
    const path = saveProjectConfig(next as Partial<Config>);
    console.log(pc.green(`saved to ${path}`));
  } else {
    const path = saveUserConfig(next as Partial<Config>);
    console.log(pc.green(`saved to ${path}`));
  }
}

export function runConfigPath(scope: "user" | "project"): void {
  if (scope === "project") {
    const path = getProjectConfigPath();
    if (!path) {
      console.log(pc.dim("(no project config)"));
      process.exit(1);
    }
    console.log(path);
    return;
  }
  console.log(USER_CONFIG_PATH);
}

export function runConfigEdit(scope: "user" | "project"): void {
  const path =
    scope === "project"
      ? getProjectConfigPath() ?? saveProjectConfig({})
      : (existsSync(USER_CONFIG_PATH) ? USER_CONFIG_PATH : saveUserConfig({}));
  const editor = process.env.VISUAL ?? process.env.EDITOR ?? "nano";
  try {
    execFileSync(editor, [path], { stdio: "inherit" });
  } catch (err) {
    console.error(pc.red(`could not launch editor (${editor})`));
    if (err instanceof Error) console.error(pc.dim(err.message));
    process.exit(1);
  }
}

export function runProviders(): void {
  const { config } = loadConfig();
  const headers = ["provider", "status", "model", "env"];
  const widths = headers.map((h) => h.length);
  const rows: string[][] = [];

  for (const id of PROVIDER_IDS) {
    const def = PROVIDER_DEFAULTS[id];
    const stored = config.providers[id];
    const keyPresent = !!stored?.apiKey || !!process.env[def.envKey];
    const isDefault = config.defaultProvider === id;
    const status = `${keyPresent ? pc.green("●") : pc.red("○")} ${keyPresent ? "ready" : "no key"}${isDefault ? pc.dim(" (default)") : ""}`;
    const model = stored?.model || def.model || pc.dim("—");
    const row = [def.label, status, model, def.envKey];
    rows.push(row);
  }

  for (const r of rows) {
    for (let i = 0; i < r.length; i++) {
      const cell = stripAnsi(r[i] ?? "");
      if (cell.length > (widths[i] ?? 0)) widths[i] = cell.length;
    }
  }

  const pad = (cell: string, idx: number): string => {
    const visible = stripAnsi(cell);
    const w = widths[idx] ?? visible.length;
    return cell + " ".repeat(Math.max(0, w - visible.length));
  };

  console.log(headers.map((h, i) => pad(pc.bold(h), i)).join("  "));
  console.log(headers.map((_, i) => "─".repeat(widths[i] ?? 0)).join("  "));
  for (const r of rows) {
    console.log(r.map((cell, i) => pad(cell, i)).join("  "));
  }
  console.log("");
  console.log(pc.dim(`styles: ${STYLE_IDS.join(", ")}`));
  console.log(pc.dim(`tip: run \`ctc setup\` to configure or \`ctc config get\` to inspect.`));
}

// eslint-disable-next-line no-control-regex -- needed to compute visible width
const ANSI_RE = /\u001B\[[0-9;]*m/g;
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}
