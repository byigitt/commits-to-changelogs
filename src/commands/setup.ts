import { confirm, isCancel, log, multiselect, note, outro, select, text, intro } from "@clack/prompts";
import pc from "picocolors";
import {
  type Config,
  type ProviderId,
  PROVIDER_DEFAULTS,
  PROVIDER_IDS,
  STYLE_IDS,
  type StyleId,
  loadConfig,
  saveProjectConfig,
  saveUserConfig,
  USER_CONFIG_PATH,
} from "../core/config.js";

const MODEL_SUGGESTIONS: Record<ProviderId, string[]> = {
  openrouter: [
    "deepseek/deepseek-chat-v3.1:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "qwen/qwen3-coder:free",
    "google/gemini-2.0-flash-exp:free",
    "z-ai/glm-4.5-air:free",
  ],
  gemini: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
  groq: [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "openai/gpt-oss-120b",
    "moonshotai/kimi-k2-instruct",
  ],
  cerebras: ["llama-3.3-70b", "llama3.1-8b", "qwen-3-235b-a22b-instruct-2507"],
  "openai-compatible": [],
};

function bail(): never {
  outro(pc.yellow("cancelled."));
  process.exit(0);
}

function checkCancel<T>(value: T | symbol): T {
  if (isCancel(value)) bail();
  return value as T;
}

export async function runSetup(): Promise<void> {
  intro(pc.bold(pc.magenta("ctc setup")));

  const { config: current } = loadConfig();

  const providerId = checkCancel(
    await select<ProviderId>({
      message: "pick an AI provider",
      options: PROVIDER_IDS.map((id) => ({
        value: id,
        label: PROVIDER_DEFAULTS[id].label,
        hint:
          id === current.defaultProvider
            ? "current default"
            : id === "openrouter"
              ? "has free models"
              : id === "gemini"
                ? "generous free tier"
                : id === "groq"
                  ? "fast, free tier"
                  : id === "cerebras"
                    ? "very fast, free tier"
                    : "bring your own URL",
      })),
      initialValue: current.defaultProvider,
    }),
  );

  const def = PROVIDER_DEFAULTS[providerId];
  const existing = current.providers[providerId];

  let baseUrl = def.baseUrl ?? "";
  if (providerId === "openai-compatible") {
    baseUrl = checkCancel(
      await text({
        message: "base URL (e.g. https://api.mistral.ai/v1)",
        placeholder: "https://api.example.com/v1",
        initialValue: existing?.baseUrl ?? "",
        validate(value) {
          if (!value || !/^https?:\/\//.test(value)) return "must be a valid http(s) URL";
          return undefined;
        },
      }),
    );
  }

  const apiKey = checkCancel(
    await text({
      message: `paste your ${def.label} API key`,
      placeholder: "sk-...",
      defaultValue: existing?.apiKey ?? "",
      validate(value) {
        if (!value || value.trim().length < 4) return "api key looks empty";
        return undefined;
      },
    }),
  );

  const suggestions = MODEL_SUGGESTIONS[providerId];
  let model: string;
  if (providerId === "openai-compatible" || suggestions.length === 0) {
    model = checkCancel(
      await text({
        message: "model id",
        placeholder: "mistral-large-latest",
        initialValue: existing?.model ?? def.model ?? "",
        validate(value) {
          if (!value || value.trim().length < 1) return "model id required";
          return undefined;
        },
      }),
    );
  } else {
    const pick = checkCancel(
      await select<string>({
        message: "pick a model (or choose custom)",
        options: [
          ...suggestions.map((m) => ({ value: m, label: m })),
          { value: "__custom__", label: "custom..." },
        ],
        initialValue: existing?.model ?? def.model,
      }),
    );
    if (pick === "__custom__") {
      model = checkCancel(
        await text({
          message: "model id",
          placeholder: def.model,
          initialValue: existing?.model ?? def.model,
          validate(value) {
            if (!value || value.trim().length < 1) return "model id required";
            return undefined;
          },
        }),
      );
    } else {
      model = pick;
    }
  }

  const output = checkCancel(
    await text({
      message: "changelog output path",
      placeholder: "CHANGELOG.md",
      initialValue: current.output,
    }),
  );

  const style = checkCancel(
    await select<StyleId>({
      message: "changelog style",
      options: STYLE_IDS.map((s) => ({
        value: s,
        label: s,
        hint:
          s === "keepachangelog"
            ? "grouped sections (Added, Changed, Fixed, ...)"
            : s === "conventional"
              ? "grouped by conventional-commit type"
              : "flat bullet list",
      })),
      initialValue: current.style,
    }),
  );

  const ignore = checkCancel(
    await multiselect<string>({
      message: "ignore these commit patterns (optional)",
      required: false,
      initialValues: current.ignore,
      options: [
        { value: "^chore: release", label: "release commits" },
        { value: "^Merge ", label: "merge commits" },
        { value: "^chore: ", label: "chore commits" },
        { value: "^docs: ", label: "docs commits" },
        { value: "^style: ", label: "style commits" },
        { value: "^test: ", label: "test commits" },
      ],
    }),
  );

  const writeProject = checkCancel(
    await confirm({
      message: "also write a project-level ctc.config.json?",
      initialValue: false,
    }),
  );

  const next: Partial<Config> = {
    defaultProvider: providerId,
    providers: {
      ...current.providers,
      [providerId]: {
        ...current.providers[providerId],
        apiKey: apiKey.trim(),
        model: model.trim(),
        ...(providerId === "openai-compatible" ? { baseUrl: baseUrl.trim() } : {}),
      },
    },
    output: output.trim() || "CHANGELOG.md",
    style,
    ignore,
  };

  const userPath = saveUserConfig(next);
  log.success(`saved user config → ${pc.cyan(userPath)}`);

  if (writeProject) {
    const projectPath = saveProjectConfig({
      defaultProvider: providerId,
      output: next.output,
      style,
      ignore,
    });
    log.success(`saved project config → ${pc.cyan(projectPath)}`);
  }

  note(
    [
      `default provider:  ${pc.bold(def.label)}`,
      `model:             ${pc.bold(model)}`,
      `output:            ${pc.bold(output || "CHANGELOG.md")}`,
      `style:             ${pc.bold(style)}`,
      "",
      `tip: env override available as ${pc.cyan(def.envKey)}`,
    ].join("\n"),
    "ready",
  );

  outro(pc.green(`run \`${pc.bold("ctc")}\` in any repo to generate a changelog.`));
}

export function describeConfigPath(): string {
  return USER_CONFIG_PATH;
}
