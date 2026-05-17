import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import envPaths from "env-paths";
import { z } from "zod";

export const PROVIDER_IDS = [
  "openrouter",
  "gemini",
  "groq",
  "cerebras",
  "openai-compatible",
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const STYLE_IDS = ["keepachangelog", "conventional", "minimal"] as const;
export type StyleId = (typeof STYLE_IDS)[number];

const ProviderCredsSchema = z.object({
  apiKey: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  name: z.string().optional(),
});
export type ProviderCreds = z.infer<typeof ProviderCredsSchema>;

export const ConfigSchema = z.object({
  defaultProvider: z.enum(PROVIDER_IDS).default("openrouter"),
  providers: z
    .object({
      openrouter: ProviderCredsSchema.optional(),
      gemini: ProviderCredsSchema.optional(),
      groq: ProviderCredsSchema.optional(),
      cerebras: ProviderCredsSchema.optional(),
      "openai-compatible": ProviderCredsSchema.optional(),
    })
    .default({}),
  output: z.string().default("CHANGELOG.md"),
  style: z.enum(STYLE_IDS).default("keepachangelog"),
  groupBy: z.enum(["type", "scope", "none"]).default("type"),
  ignore: z.array(z.string()).default(["^chore: release", "^Merge "]),
});
export type Config = z.infer<typeof ConfigSchema>;

export const PROVIDER_DEFAULTS: Record<
  ProviderId,
  { label: string; model: string; baseUrl?: string; envKey: string }
> = {
  openrouter: {
    label: "OpenRouter",
    model: "deepseek/deepseek-chat-v3.1:free",
    baseUrl: "https://openrouter.ai/api/v1",
    envKey: "CTC_OPENROUTER_API_KEY",
  },
  gemini: {
    label: "Google Gemini",
    model: "gemini-2.5-flash",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    envKey: "CTC_GEMINI_API_KEY",
  },
  groq: {
    label: "Groq",
    model: "llama-3.3-70b-versatile",
    baseUrl: "https://api.groq.com/openai/v1",
    envKey: "CTC_GROQ_API_KEY",
  },
  cerebras: {
    label: "Cerebras",
    model: "llama-3.3-70b",
    baseUrl: "https://api.cerebras.ai/v1",
    envKey: "CTC_CEREBRAS_API_KEY",
  },
  "openai-compatible": {
    label: "OpenAI-compatible (custom)",
    model: "",
    envKey: "CTC_CUSTOM_API_KEY",
  },
};

const paths = envPaths("ctc", { suffix: "" });

export const USER_CONFIG_DIR = paths.config;
export const USER_CONFIG_PATH = join(USER_CONFIG_DIR, "config.json");
export const PROJECT_CONFIG_FILENAMES = ["ctc.config.json", ".ctcrc.json"] as const;

export function getProjectConfigPath(cwd: string = process.cwd()): string | null {
  for (const name of PROJECT_CONFIG_FILENAMES) {
    const p = resolve(cwd, name);
    if (existsSync(p)) return p;
  }
  return null;
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function deepMerge<T>(a: T, b: Partial<T> | undefined): T {
  if (!b) return a;
  if (typeof a !== "object" || a === null || Array.isArray(a)) return (b as T) ?? a;
  const out: Record<string, unknown> = { ...(a as Record<string, unknown>) };
  for (const [key, value] of Object.entries(b as Record<string, unknown>)) {
    const av = (a as Record<string, unknown>)[key];
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      av !== null &&
      typeof av === "object" &&
      !Array.isArray(av)
    ) {
      out[key] = deepMerge(av, value as Record<string, unknown>);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out as T;
}

function applyEnvOverrides(cfg: Config): Config {
  const next = structuredClone(cfg);
  for (const id of PROVIDER_IDS) {
    const envKey = PROVIDER_DEFAULTS[id].envKey;
    const v = process.env[envKey];
    if (v) {
      const existing = next.providers[id] ?? {};
      next.providers[id] = { ...existing, apiKey: v };
    }
  }
  const envProvider = process.env.CTC_PROVIDER as ProviderId | undefined;
  if (envProvider && PROVIDER_IDS.includes(envProvider)) {
    next.defaultProvider = envProvider;
  }
  const envModel = process.env.CTC_MODEL;
  if (envModel) {
    const id = next.defaultProvider;
    const existing = next.providers[id] ?? {};
    next.providers[id] = { ...existing, model: envModel };
  }
  return next;
}

export interface LoadedConfig {
  config: Config;
  sources: { user: boolean; project: string | null };
}

export function loadConfig(cwd: string = process.cwd()): LoadedConfig {
  const userRaw = existsSync(USER_CONFIG_PATH) ? readJson(USER_CONFIG_PATH) : null;
  const projectPath = getProjectConfigPath(cwd);
  const projectRaw = projectPath ? readJson(projectPath) : null;

  const defaults = ConfigSchema.parse({});
  let merged: Config = defaults;
  if (userRaw && typeof userRaw === "object") {
    merged = deepMerge(merged, userRaw as Partial<Config>);
  }
  if (projectRaw && typeof projectRaw === "object") {
    merged = deepMerge(merged, projectRaw as Partial<Config>);
  }
  const parsed = ConfigSchema.parse(merged);
  const withEnv = applyEnvOverrides(parsed);
  return {
    config: withEnv,
    sources: { user: !!userRaw, project: projectPath },
  };
}

export function saveUserConfig(cfg: Partial<Config>): string {
  if (!existsSync(USER_CONFIG_DIR)) mkdirSync(USER_CONFIG_DIR, { recursive: true });
  const existing = existsSync(USER_CONFIG_PATH)
    ? (readJson(USER_CONFIG_PATH) as Partial<Config> | null)
    : null;
  const next = deepMerge(ConfigSchema.parse({}), {
    ...existing,
    ...cfg,
  });
  const validated = ConfigSchema.parse(next);
  writeFileSync(USER_CONFIG_PATH, JSON.stringify(validated, null, 2) + "\n", "utf8");
  return USER_CONFIG_PATH;
}

export function saveProjectConfig(cfg: Partial<Config>, cwd: string = process.cwd()): string {
  const target = resolve(cwd, "ctc.config.json");
  const dir = dirname(target);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const existing = existsSync(target) ? (readJson(target) as Partial<Config> | null) : null;
  const merged = deepMerge(ConfigSchema.parse({}), { ...existing, ...cfg });
  const validated = ConfigSchema.parse(merged);
  writeFileSync(target, JSON.stringify(validated, null, 2) + "\n", "utf8");
  return target;
}

export function resolveProviderCreds(
  cfg: Config,
  providerId: ProviderId,
): { apiKey: string | undefined; model: string; baseUrl: string | undefined; label: string } {
  const def = PROVIDER_DEFAULTS[providerId];
  const stored = cfg.providers[providerId] ?? {};
  return {
    apiKey: stored.apiKey,
    model: stored.model || def.model,
    baseUrl: stored.baseUrl ?? def.baseUrl,
    label: stored.name ?? def.label,
  };
}
