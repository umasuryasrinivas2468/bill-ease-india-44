// Gemini chat client — browser-direct, mirrors the previous OpenRouter shape.
//
// Config:
//   VITE_GEMINI_API_KEY        required
//   VITE_GEMINI_MODEL          optional, default 'gemini-2.5-flash'
//   VITE_GEMINI_AGENT_MODEL    optional, model used by the tool-calling agent
//
// The Gemini REST endpoint shape differs from OpenAI/OpenRouter (roles are
// 'user' | 'model', system goes in a separate field, parts are an array), so
// this module exposes an OpenAI-style surface and translates internally. That
// keeps the existing services almost unchanged.

const GEMINI_API_KEY = (import.meta.env.VITE_GEMINI_API_KEY as string) || '';
const GEMINI_MODEL =
  (import.meta.env.VITE_GEMINI_MODEL as string) || 'gemini-2.5-flash';
const GEMINI_AGENT_MODEL =
  (import.meta.env.VITE_GEMINI_AGENT_MODEL as string) || GEMINI_MODEL;

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export type GeminiRole = 'system' | 'user' | 'assistant';

export interface GeminiMessage {
  role: GeminiRole;
  content: string;
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface GeminiToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface GeminiChatArgs {
  messages: GeminiMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Forces a JSON-object response. */
  jsonMode?: boolean;
  signal?: AbortSignal;
  /** Function declarations the model is allowed to call. */
  tools?: GeminiFunctionDeclaration[];
  /**
   * Disable Gemini 2.5's internal "thinking" tokens for this call.
   * Defaults to true when jsonMode is true (thinking burns the output budget
   * before producing any JSON, which causes MAX_TOKENS truncation).
   */
  disableThinking?: boolean;
}

export interface GeminiChatResult {
  /** Text part of the response (empty when the model returned only tool calls). */
  content: string;
  /** Tool calls emitted by the model in this turn, in order. */
  toolCalls: GeminiToolCall[];
  model: string;
  finishReason?: string;
  raw: unknown;
}

export const isGeminiConfigured = (): boolean => Boolean(GEMINI_API_KEY);
export const GEMINI_DEFAULT_MODEL = GEMINI_MODEL;
export const GEMINI_DEFAULT_AGENT_MODEL = GEMINI_AGENT_MODEL;

// ── Internal: OpenAI-style messages → Gemini contents ─────────────────────────
interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

const toGeminiContents = (
  messages: GeminiMessage[],
): { systemInstruction?: { parts: GeminiPart[] }; contents: GeminiContent[] } => {
  const systemTexts: string[] = [];
  const contents: GeminiContent[] = [];

  for (const m of messages) {
    if (m.role === 'system') {
      systemTexts.push(m.content);
      continue;
    }
    contents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    });
  }

  return {
    systemInstruction: systemTexts.length
      ? { parts: [{ text: systemTexts.join('\n\n') }] }
      : undefined,
    contents,
  };
};

// ── Main chat call ────────────────────────────────────────────────────────────
export const geminiChat = async (args: GeminiChatArgs): Promise<GeminiChatResult> => {
  if (!GEMINI_API_KEY) {
    throw new Error(
      'Gemini API key is missing. Set VITE_GEMINI_API_KEY in your .env and restart the dev server.',
    );
  }

  const model = args.model || GEMINI_MODEL;
  const { systemInstruction, contents } = toGeminiContents(args.messages);

  const disableThinking = args.disableThinking ?? args.jsonMode === true;
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: args.temperature ?? 0.2,
      maxOutputTokens: args.maxTokens ?? 1024,
      ...(args.jsonMode ? { responseMimeType: 'application/json' } : {}),
      ...(disableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  };
  if (systemInstruction) body.systemInstruction = systemInstruction;
  if (args.tools && args.tools.length > 0) {
    body.tools = [{ functionDeclarations: args.tools }];
  }

  const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(
    GEMINI_API_KEY,
  )}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: args.signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    let message = `Gemini error ${res.status}`;
    try {
      const parsed = JSON.parse(errText);
      message = parsed?.error?.message || parsed?.message || message;
    } catch {
      if (errText) message = `${message}: ${errText.slice(0, 240)}`;
    }
    throw new Error(message);
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const parts: GeminiPart[] = candidate?.content?.parts || [];

  const textParts: string[] = [];
  const toolCalls: GeminiToolCall[] = [];
  for (const p of parts) {
    if (typeof p.text === 'string' && p.text.length > 0) textParts.push(p.text);
    if (p.functionCall && typeof p.functionCall.name === 'string') {
      toolCalls.push({
        name: p.functionCall.name,
        args: (p.functionCall.args || {}) as Record<string, unknown>,
      });
    }
  }

  const content = textParts.join('').trim();
  if (!content && toolCalls.length === 0) {
    throw new Error('Gemini returned an empty response.');
  }

  return {
    content,
    toolCalls,
    model,
    finishReason: candidate?.finishReason,
    raw: data,
  };
};

// ── JSON helper ───────────────────────────────────────────────────────────────
//
// Gemini's responseMimeType:application/json is *usually* strict, but the model
// can still emit:
//   - markdown fences around the JSON
//   - raw newlines / tabs inside string values (e.g. multi-line narration)
//   - prose before/after the JSON object
//   - truncated output when maxOutputTokens is hit
//
// This helper tries to recover from all four. On a hard failure it throws an
// error containing a short snippet of the raw response so the caller can show
// something diagnosable instead of "Unterminated string in JSON at position 84".

const stripFences = (s: string) =>
  s
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

/** Extract the outermost {...} block, ignoring braces inside string literals. */
const extractFirstJsonObject = (raw: string): string | null => {
  const start = raw.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null; // unbalanced — likely truncated
};

/** Escape raw control chars inside JSON string literals. */
const escapeRawControlsInStrings = (raw: string): string => {
  let out = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escape) { out += ch; escape = false; continue; }
      if (ch === '\\') { out += ch; escape = true; continue; }
      if (ch === '"') { out += ch; inString = false; continue; }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { out += '\\r'; continue; }
      if (ch === '\t') { out += '\\t'; continue; }
      out += ch;
    } else {
      out += ch;
      if (ch === '"') inString = true;
    }
  }
  return out;
};

export const geminiJSON = async <T = unknown>(args: GeminiChatArgs): Promise<T> => {
  const res = await geminiChat({ ...args, jsonMode: true });

  if (res.finishReason === 'MAX_TOKENS') {
    throw new Error(
      `Gemini response was truncated (hit maxOutputTokens=${args.maxTokens ?? 1024}). ` +
      `Raise maxTokens for this call or shorten the prompt.`,
    );
  }

  const candidates = [
    stripFences(res.content),
    extractFirstJsonObject(stripFences(res.content)) || '',
  ].filter(Boolean);

  for (const c of candidates) {
    try { return JSON.parse(c) as T; } catch { /* try next */ }
    try { return JSON.parse(escapeRawControlsInStrings(c)) as T; } catch { /* try next */ }
  }

  const snippet = res.content.length > 400 ? `${res.content.slice(0, 400)}…` : res.content;
  throw new Error(
    `Gemini returned content that was not valid JSON. ` +
    `finishReason=${res.finishReason || 'unknown'}. Raw response: ${snippet}`,
  );
};

// ── Agent helper: function-calling round with tool results ───────────────────
//
// For multi-turn tool calling we need to send the model's prior tool calls and
// the results back. Gemini wants each tool result as a user-role message with
// a functionResponse part. This helper builds that follow-up turn.
export interface GeminiToolResult {
  name: string;
  response: Record<string, unknown>;
}

export interface GeminiAgentTurnArgs {
  /** Prior conversation contents (already-translated Gemini format). */
  history: GeminiContent[];
  /** Tool results from the previous assistant turn. */
  toolResults: GeminiToolResult[];
  tools?: GeminiFunctionDeclaration[];
  systemInstruction?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface GeminiAgentTurnResult extends GeminiChatResult {
  /** Updated history including the latest model turn — pass to the next turn. */
  history: GeminiContent[];
}

/**
 * One round-trip in a tool-calling loop. Caller maintains the `history` array
 * and accumulates tool results between turns. Returns the model's next message
 * and updated history.
 */
export const geminiAgentTurn = async (
  args: GeminiAgentTurnArgs,
): Promise<GeminiAgentTurnResult> => {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is missing. Set VITE_GEMINI_API_KEY in your .env.');
  }

  const model = args.model || GEMINI_AGENT_MODEL;
  const history = args.history.slice();

  if (args.toolResults.length > 0) {
    history.push({
      role: 'user',
      parts: args.toolResults.map((r) => ({
        functionResponse: { name: r.name, response: r.response },
      })),
    });
  }

  const body: Record<string, unknown> = {
    contents: history,
    generationConfig: {
      temperature: args.temperature ?? 0.2,
      maxOutputTokens: args.maxTokens ?? 1024,
      // Cap thinking so a turn can't burn the whole output budget reasoning
      // about which tool to call. 512 is plenty for one tool-routing decision.
      thinkingConfig: { thinkingBudget: 512 },
    },
  };
  if (args.systemInstruction) {
    body.systemInstruction = { parts: [{ text: args.systemInstruction }] };
  }
  if (args.tools && args.tools.length > 0) {
    body.tools = [{ functionDeclarations: args.tools }];
  }

  const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(
    GEMINI_API_KEY,
  )}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: args.signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    let message = `Gemini error ${res.status}`;
    try {
      const parsed = JSON.parse(errText);
      message = parsed?.error?.message || parsed?.message || message;
    } catch {
      if (errText) message = `${message}: ${errText.slice(0, 240)}`;
    }
    throw new Error(message);
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const parts: GeminiPart[] = candidate?.content?.parts || [];

  const textParts: string[] = [];
  const toolCalls: GeminiToolCall[] = [];
  for (const p of parts) {
    if (typeof p.text === 'string' && p.text.length > 0) textParts.push(p.text);
    if (p.functionCall && typeof p.functionCall.name === 'string') {
      toolCalls.push({
        name: p.functionCall.name,
        args: (p.functionCall.args || {}) as Record<string, unknown>,
      });
    }
  }

  // Append the model's response to history so the next turn has full context.
  if (parts.length > 0) {
    history.push({ role: 'model', parts });
  }

  return {
    content: textParts.join('').trim(),
    toolCalls,
    history,
    model,
    finishReason: candidate?.finishReason,
    raw: data,
  };
};

/** Build a starting history from a single user prompt. */
export const buildAgentHistory = (userPrompt: string): GeminiContent[] => [
  { role: 'user', parts: [{ text: userPrompt }] },
];

export type { GeminiContent, GeminiPart };
