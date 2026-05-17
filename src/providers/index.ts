import { PROVIDER_DEFAULTS, type Config, type ProviderId, resolveProviderCreds } from "../core/config.js";
import { chatCompletion } from "./openai-compatible.js";
import type { AIProvider, GenerateOptions, ProviderResult } from "./types.js";

export type { AIProvider, ChatMessage, GenerateOptions, ProviderResult } from "./types.js";

interface BuildProviderArgs {
  id: ProviderId;
  apiKey: string;
  model: string;
  baseUrl: string;
  label: string;
}

function buildOpenAICompatibleProvider(args: BuildProviderArgs): AIProvider {
  const { id, apiKey, model, baseUrl, label } = args;
  const extraHeaders: Record<string, string> = {};
  if (id === "openrouter") {
    extraHeaders["HTTP-Referer"] = "https://github.com/byigitt/commits-to-changelogs";
    extraHeaders["X-Title"] = "commits-to-changelogs";
  }
  return {
    id,
    label,
    defaultModel: model,
    async generate(opts: GenerateOptions): Promise<ProviderResult> {
      return chatCompletion({ baseUrl, apiKey, extraHeaders }, { ...opts, model: opts.model || model });
    },
  };
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public hint?: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export function getProvider(cfg: Config, providerId?: ProviderId): AIProvider {
  const id = providerId ?? cfg.defaultProvider;
  const creds = resolveProviderCreds(cfg, id);
  if (!creds.apiKey) {
    throw new ProviderError(
      `no API key configured for ${PROVIDER_DEFAULTS[id].label}`,
      `run \`ctc setup\` or set ${PROVIDER_DEFAULTS[id].envKey}`,
    );
  }
  if (!creds.baseUrl) {
    throw new ProviderError(
      `no base URL configured for ${PROVIDER_DEFAULTS[id].label}`,
      "set providers.openai-compatible.baseUrl in your config",
    );
  }
  if (!creds.model) {
    throw new ProviderError(
      `no model configured for ${PROVIDER_DEFAULTS[id].label}`,
      "run `ctc setup` to pick a model",
    );
  }
  return buildOpenAICompatibleProvider({
    id,
    apiKey: creds.apiKey,
    model: creds.model,
    baseUrl: creds.baseUrl,
    label: creds.label,
  });
}
