export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateOptions {
  messages: ChatMessage[];
  model: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  signal?: AbortSignal;
  onToken?: (chunk: string) => void;
}

export interface ProviderResult {
  text: string;
  raw?: unknown;
}

export interface AIProvider {
  id: string;
  label: string;
  defaultModel: string;
  generate(opts: GenerateOptions): Promise<ProviderResult>;
}
