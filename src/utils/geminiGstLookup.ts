export type GstLookupResult = {
  businessName?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
};

const pick = (obj: any, keys: string[]): string | undefined => {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const k of keys) {
    for (const candidate of Object.keys(obj)) {
      if (candidate.toLowerCase().replace(/[_\s-]/g, '') === k.toLowerCase().replace(/[_\s-]/g, '')) {
        const v = obj[candidate];
        if (typeof v === 'string' && v.trim()) return v.trim();
        if (typeof v === 'number') return String(v);
      }
    }
  }
  return undefined;
};

const flattenGeminiResult = (raw: any): GstLookupResult => {
  let node = raw;
  if (Array.isArray(node)) node = node[0];
  if (node?.data) node = node.data;
  if (node?.result) node = node.result;
  if (node?.gst) node = { ...node, ...node.gst };
  if (node?.gstin) node = { ...node, ...node.gstin };
  if (node?.business) node = { ...node, ...node.business };

  const addrNode = node?.address || node?.businessAddress || node?.principalAddress || node?.pradr || node?.pradr?.addr;
  const addrObj = (addrNode && typeof addrNode === 'object') ? addrNode : null;

  const businessName = pick(node, [
    'businessName', 'business_name', 'tradeName', 'trade_name',
    'legalName', 'legal_name', 'name', 'tradeNam', 'lgnm',
    'companyName', 'company_name',
  ]);

  let address = pick(node, [
    'address', 'addressLine1', 'address_line_1', 'fullAddress', 'street', 'addressLine',
  ]);
  if (!address && addrObj) {
    const parts = [
      pick(addrObj, ['bno', 'buildingNo', 'building']),
      pick(addrObj, ['bnm', 'buildingName']),
      pick(addrObj, ['flno', 'floor']),
      pick(addrObj, ['st', 'street']),
      pick(addrObj, ['loc', 'locality', 'area']),
    ].filter(Boolean);
    if (parts.length) address = parts.join(', ');
  }

  const city = pick(node, ['city', 'district', 'dst'])
    || (addrObj ? pick(addrObj, ['city', 'district', 'dst', 'loc']) : undefined);
  const state = pick(node, ['state', 'stateName', 'state_name', 'stcd'])
    || (addrObj ? pick(addrObj, ['state', 'stateName', 'stcd']) : undefined);
  const pincode = pick(node, ['pincode', 'pinCode', 'pin', 'postalCode', 'postal_code', 'zip', 'pncd'])
    || (addrObj ? pick(addrObj, ['pincode', 'pin', 'pncd', 'postalCode']) : undefined);

  return { businessName, address, city, state, pincode };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Models tried in order. First one is fastest, fallbacks are progressively more stable.
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
const MAX_RETRIES_PER_MODEL = 3;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

const callGemini = async (model: string, apiKey: string, prompt: string): Promise<string> => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const err: Error & { status?: number } = new Error(`Gemini ${res.status}: ${errText.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  return text;
};

export const lookupGstWithGemini = async (gstNumber: string): Promise<GstLookupResult> => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Add VITE_GEMINI_API_KEY to your .env file and restart the dev server.');
  }

  const gst = gstNumber.trim().toUpperCase();
  if (!gst) throw new Error('GST number is empty');

  const prompt = `find gst of ${gst} and return in json format`;

  let lastError: Error | null = null;

  for (const model of MODELS) {
    for (let attempt = 0; attempt < MAX_RETRIES_PER_MODEL; attempt++) {
      try {
        const text = await callGemini(model, apiKey, prompt);

        let jsonStr = text.trim();
        const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fence) jsonStr = fence[1].trim();

        const raw = JSON.parse(jsonStr);
        return flattenGeminiResult(raw);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const status = (lastError as Error & { status?: number }).status;
        const retryable = status !== undefined && RETRYABLE_STATUSES.has(status);

        // Non-retryable -> break inner loop, try next model
        if (!retryable && status !== undefined) break;

        // Retryable -> exponential backoff before next attempt on same model
        if (attempt < MAX_RETRIES_PER_MODEL - 1) {
          const delay = 600 * Math.pow(2, attempt) + Math.floor(Math.random() * 300);
          console.warn(`[GST-Lookup] ${model} attempt ${attempt + 1} failed (${status ?? 'parse/empty'}), retrying in ${delay}ms`);
          await sleep(delay);
        }
      }
    }
    console.warn(`[GST-Lookup] Falling through from ${model}`);
  }

  throw lastError || new Error('Gemini lookup failed after retries');
};
