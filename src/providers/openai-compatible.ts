import type { ChatMessage, GenerateOptions, ProviderResult } from "./types.js";

export interface OpenAICompatibleConfig {
  baseUrl: string;
  apiKey: string;
  extraHeaders?: Record<string, string>;
}

interface ChatCompletionChoice {
  index: number;
  message?: { role: string; content: string | null };
  delta?: { role?: string; content?: string };
  finish_reason?: string | null;
}

interface ChatCompletionResponse {
  id?: string;
  choices: ChatCompletionChoice[];
}

function trimBase(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function toBody(messages: ChatMessage[], model: string, opts: GenerateOptions, stream: boolean) {
  const body: Record<string, unknown> = {
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream,
  };
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;
  return body;
}

export async function chatCompletion(
  config: OpenAICompatibleConfig,
  opts: GenerateOptions,
): Promise<ProviderResult> {
  const url = `${trimBase(config.baseUrl)}/chat/completions`;
  const stream = opts.stream === true;
  const body = toBody(opts.messages, opts.model, opts, stream);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
    ...config.extraHeaders,
  };

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    const text = await safeText(res);
    throw new Error(
      `provider request failed (${res.status} ${res.statusText}) at ${url}\n${text}`,
    );
  }

  if (!stream) {
    const json = (await res.json()) as ChatCompletionResponse;
    const text = json.choices[0]?.message?.content ?? "";
    return { text, raw: json };
  }

  return await consumeStream(res, opts.onToken);
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

async function consumeStream(
  res: Response,
  onToken?: (chunk: string) => void,
): Promise<ProviderResult> {
  if (!res.body) throw new Error("provider returned no stream body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return { text: full };
      try {
        const parsed = JSON.parse(payload) as ChatCompletionResponse;
        const delta = parsed.choices[0]?.delta?.content;
        if (delta) {
          full += delta;
          onToken?.(delta);
        }
      } catch {
        // ignore malformed SSE chunks
      }
    }
  }
  return { text: full };
}
