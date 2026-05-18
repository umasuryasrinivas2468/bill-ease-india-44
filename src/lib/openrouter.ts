// OpenRouter chat client — proxies to Claude / GPT / etc. through a single API.
//
// Config (browser-direct, matches the existing Gemini/Mistral pattern):
//   VITE_OPENROUTER_API_KEY  required
//   VITE_OPENROUTER_MODEL    optional, default 'anthropic/claude-opus-4'
//   VITE_OPENROUTER_REFERER  optional, sent as HTTP-Referer header (helps OpenRouter attribution)
//   VITE_OPENROUTER_TITLE    optional, sent as X-Title header

const OPENROUTER_API_KEY = (import.meta.env.VITE_OPENROUTER_API_KEY as string) || '';
const OPENROUTER_MODEL =
  (import.meta.env.VITE_OPENROUTER_MODEL as string) || 'anthropic/claude-opus-4';
const OPENROUTER_REFERER =
  (import.meta.env.VITE_OPENROUTER_REFERER as string) ||
  (typeof window !== 'undefined' ? window.location.origin : 'https://aczen.app');
const OPENROUTER_TITLE = (import.meta.env.VITE_OPENROUTER_TITLE as string) || 'Aczen BillEase';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export type OpenRouterRole = 'system' | 'user' | 'assistant';

export interface OpenRouterMessage {
  role: OpenRouterRole;
  content: string;
}

export interface OpenRouterChatArgs {
  messages: OpenRouterMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Forces the model to emit a valid JSON object response. */
  jsonMode?: boolean;
  signal?: AbortSignal;
}

export interface OpenRouterChatResult {
  content: string;
  model: string;
  raw: unknown;
}

export const isOpenRouterConfigured = (): boolean => Boolean(OPENROUTER_API_KEY);

export const openRouterChat = async (
  args: OpenRouterChatArgs,
): Promise<OpenRouterChatResult> => {
  if (!OPENROUTER_API_KEY) {
    throw new Error(
      'OpenRouter API key is missing. Set VITE_OPENROUTER_API_KEY in your .env and restart the dev server.',
    );
  }

  const body: Record<string, unknown> = {
    model: args.model || OPENROUTER_MODEL,
    messages: args.messages,
    temperature: args.temperature ?? 0.2,
    max_tokens: args.maxTokens ?? 1024,
  };

  if (args.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': OPENROUTER_REFERER,
      'X-Title': OPENROUTER_TITLE,
    },
    body: JSON.stringify(body),
    signal: args.signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    let message = `OpenRouter error ${res.status}`;
    try {
      const parsed = JSON.parse(errText);
      message = parsed?.error?.message || parsed?.message || message;
    } catch {
      if (errText) message = `${message}: ${errText.slice(0, 240)}`;
    }
    throw new Error(message);
  }

  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? '';
  if (!content) {
    throw new Error('OpenRouter returned an empty response.');
  }

  return { content, model: data?.model || (args.model || OPENROUTER_MODEL), raw: data };
};

/**
 * Calls OpenRouter in JSON mode and parses the response.
 * Strips markdown fences if the model emits them despite json_object mode.
 */
export const openRouterJSON = async <T = unknown>(
  args: OpenRouterChatArgs,
): Promise<T> => {
  const { content } = await openRouterChat({ ...args, jsonMode: true });
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned) as T;
};

export const OPENROUTER_DEFAULT_MODEL = OPENROUTER_MODEL;
