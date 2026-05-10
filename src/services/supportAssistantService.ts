// Agentic support assistant — grounds answers in the live Aczen docs site
// (https://aczen-d43c4738.mintlify.app) and calls the Gemini API directly.
//
// Configuration:
//   VITE_GEMINI_API_KEY  — required, browser-safe key for Generative Language API
//   VITE_GEMINI_MODEL    — optional, defaults to gemini-2.5-flash
//   VITE_ACZEN_DOCS_URL  — optional, override docs origin

const GEMINI_API_KEY = (import.meta.env.VITE_GEMINI_API_KEY as string) || '';
const GEMINI_MODEL =
  (import.meta.env.VITE_GEMINI_MODEL as string) || 'gemini-2.5-flash';
const DOCS_BASE = (
  (import.meta.env.VITE_ACZEN_DOCS_URL as string) ||
  'https://aczen-d43c4738.mintlify.app'
).replace(/\/$/, '');

const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const MAX_DOC_CHARS = 140_000; // keep prompt under model limits with headroom for files
const DOC_TTL_MS = 30 * 60 * 1000;

export interface SupportAttachment {
  name: string;
  mimeType: string;
  base64: string; // raw base64 (no data URI prefix)
  size: number;
}

export interface SupportTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface AskSupportArgs {
  question: string;
  history: SupportTurn[];
  attachments?: SupportAttachment[];
  signal?: AbortSignal;
}

export interface AskSupportResult {
  answer: string;
  sources: string[];
}

interface DocCacheEntry {
  text: string;
  fetchedAt: number;
  origin: string;
}

let docsCache: DocCacheEntry | null = null;
let docsInflight: Promise<DocCacheEntry> | null = null;

const safeFetch = async (url: string, signal?: AbortSignal): Promise<string | null> => {
  try {
    const res = await fetch(url, { signal, cache: 'force-cache' });
    if (!res.ok) return null;
    const text = await res.text();
    return text || null;
  } catch {
    return null;
  }
};

const fetchDocs = async (signal?: AbortSignal): Promise<DocCacheEntry> => {
  // Mintlify automatically exposes /llms-full.txt (concatenated docs) and /llms.txt (index).
  const fullUrl = `${DOCS_BASE}/llms-full.txt`;
  const indexUrl = `${DOCS_BASE}/llms.txt`;

  const full = await safeFetch(fullUrl, signal);
  if (full && full.trim()) {
    return { text: full, fetchedAt: Date.now(), origin: fullUrl };
  }

  const idx = await safeFetch(indexUrl, signal);
  if (idx && idx.trim()) {
    return { text: idx, fetchedAt: Date.now(), origin: indexUrl };
  }

  return { text: '', fetchedAt: Date.now(), origin: '' };
};

export const loadAczenDocs = async (signal?: AbortSignal): Promise<DocCacheEntry> => {
  const fresh = docsCache && Date.now() - docsCache.fetchedAt < DOC_TTL_MS;
  if (fresh) return docsCache!;
  if (docsInflight) return docsInflight;

  docsInflight = fetchDocs(signal)
    .then((entry) => {
      docsCache = entry;
      return entry;
    })
    .finally(() => {
      docsInflight = null;
    });

  return docsInflight;
};

const buildSystemInstruction = (docs: string): string => {
  const trimmed = docs.length > MAX_DOC_CHARS ? docs.slice(0, MAX_DOC_CHARS) : docs;
  return `You are Aczen Support, an agentic assistant inside the Aczen / BillEase finance product.
Your job: answer user questions clearly, dynamically, and with concrete next steps. Act like a senior product specialist who has full knowledge of the documentation below.

Behaviour rules:
- Always ground answers in the OFFICIAL ACZEN DOCS provided. Quote exact section titles, feature names, and steps from the docs when relevant.
- If a topic is partially covered, fill the gap with safe, generic finance/SaaS guidance and clearly mark it as a suggestion.
- If something is genuinely not in the docs, say so honestly and propose the closest documented workflow.
- When the user attaches a screenshot, PDF, invoice, bank statement, or other file, read it carefully and reason about its contents before responding.
- Prefer numbered steps for procedures, short paragraphs for explanations, and inline links like ${DOCS_BASE}/<slug> when you cite a doc page.
- Be concise — no filler, no "as an AI" disclaimers. Use Markdown.
- If the user asks something destructive or risky (e.g. payouts, deletes), warn them once and confirm before walking through the steps.

# OFFICIAL ACZEN DOCS
${trimmed || '(Documentation could not be fetched. Use general product knowledge and suggest the user open the docs at ' + DOCS_BASE + '.)'}\n`;
};

const extractSources = (text: string): string[] => {
  const re = new RegExp(`${DOCS_BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[A-Za-z0-9_\\-/#?=&%.]+`, 'g');
  const matches = text.match(re) || [];
  return Array.from(new Set(matches));
};

export const askSupportAssistant = async (
  args: AskSupportArgs,
): Promise<AskSupportResult> => {
  if (!GEMINI_API_KEY) {
    throw new Error(
      'Gemini API key is missing. Add VITE_GEMINI_API_KEY=<your key> to your .env and restart the dev server.',
    );
  }

  const docs = await loadAczenDocs(args.signal);
  const systemInstruction = buildSystemInstruction(docs.text);

  type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

  const contents: { role: 'user' | 'model'; parts: Part[] }[] = args.history.map((turn) => ({
    role: turn.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: turn.text }],
  }));

  const currentParts: Part[] = [];
  for (const att of args.attachments ?? []) {
    currentParts.push({
      inlineData: { mimeType: att.mimeType, data: att.base64 },
    });
  }
  const userText =
    args.question.trim() ||
    (args.attachments && args.attachments.length > 0
      ? 'Please review the attached file(s) and help me with what you find.'
      : '');
  currentParts.push({ text: userText });
  contents.push({ role: 'user', parts: currentParts });

  const body = {
    systemInstruction: { role: 'user', parts: [{ text: systemInstruction }] },
    contents,
    generationConfig: {
      temperature: 0.4,
      topP: 0.95,
      maxOutputTokens: 2048,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  };

  const res = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: args.signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    let message = `Gemini API error ${res.status}`;
    try {
      const parsed = JSON.parse(errText);
      message = parsed?.error?.message || message;
    } catch {
      if (errText) message = `${message}: ${errText.slice(0, 200)}`;
    }
    throw new Error(message);
  }

  const data = await res.json();
  const blockReason = data?.promptFeedback?.blockReason;
  if (blockReason) {
    throw new Error(`Request was blocked by safety filters: ${blockReason}`);
  }

  const candidate = data?.candidates?.[0];
  const parts: Array<{ text?: string }> = candidate?.content?.parts ?? [];
  const answer = parts
    .map((p) => p?.text || '')
    .filter(Boolean)
    .join('\n')
    .trim();

  if (!answer) {
    throw new Error('The assistant returned an empty response. Please try again.');
  }

  return { answer, sources: extractSources(answer) };
};

export const fileToSupportAttachment = (file: File): Promise<SupportAttachment> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        base64,
        size: file.size,
      });
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

export const ACZEN_DOCS_URL = DOCS_BASE;
