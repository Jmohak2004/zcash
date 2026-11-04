import OpenAI from 'openai';

export const EXTRACTION_PROMPT = "You are 'Z-Pay', an autonomous headless PoS for Zcash. Parse the user message and extract: `amount_zec` (float) and `memo` (string). Return ONLY raw JSON like: { 'amount_zec': 0.5, 'memo': 'design' }.";

export function validateInvoice(value) {
  const amount = value?.amount_zec;
  // Reject sub-zatoshi precision instead of silently rounding the invoice.
  const units = amount * 100_000_000;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 21_000_000 || Math.abs(units - Math.round(units)) > 0.000001) {
    throw new Error('Use a positive ZEC amount with at most 8 decimal places.');
  }
  if (typeof value.memo !== 'string' || !value.memo.trim() || Buffer.byteLength(value.memo, 'utf8') > 470) {
    throw new Error('Include a description of at most 470 UTF-8 bytes.');
  }
  return { amount, memo: value.memo.trim() };
}

export async function extractInvoice(message) {
  if (typeof message !== 'string' || !message.trim() || message.length > 2000) throw new Error('Invalid message.');
  // JSON mode preserves the exact requested system prompt while ensuring real
  // JSON (double quotes), despite the single-quoted example in that prompt.
  // Base URL is configurable so an OpenAI-compatible provider (e.g. Gemini's
  // OpenAI endpoint) can be used without changing the extraction contract.
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL || undefined, timeout: 8000, maxRetries: 0 });
  const result = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: EXTRACTION_PROMPT }, { role: 'user', content: message }],
  });
  return validateInvoice(JSON.parse(result.choices[0]?.message.content || '{}'));
}
