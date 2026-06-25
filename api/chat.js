// ============================================================================
//  Hànlù AI Tutor — serverless chat endpoint  (POST /api/chat)
// ----------------------------------------------------------------------------
//  Runs on Vercel (Node 18+ serverless function). The browser NEVER sees your
//  API key — it lives only in this server's environment variables.
//
//  ░░ WHERE THE API KEY GOES ░░
//  Set it in Vercel → Project → Settings → Environment Variables (NOT in code,
//  NOT in the repo). For local dev, copy .env.example to .env.local.
//
//  Required environment variables (see .env.example):
//    AI_PROVIDER       "anthropic" (default) | "openai"
//    ANTHROPIC_API_KEY your Anthropic key   (required when provider=anthropic)
//    OPENAI_API_KEY    your OpenAI key       (required when provider=openai)
//    AI_MODEL          model id override (optional — sensible default per provider)
//    ALLOWED_ORIGINS   comma-separated CORS allowlist (optional; defaults below)
//
//  Returns JSON:  { "reply": "..." }   (or { "error": "..." } on failure)
// ============================================================================

import Anthropic from '@anthropic-ai/sdk';

// ── Tunable safety / cost guards ────────────────────────────────────────────
const MAX_MESSAGES       = 24;     // most recent turns kept from the request
const MAX_INPUT_CHARS    = 2000;   // per single message
const MAX_TOTAL_CHARS    = 12000;  // whole conversation (cost guard)
const MAX_OUTPUT_TOKENS  = 800;    // cap reply length (cost guard)

// Best-effort per-IP rate limit. NOTE: serverless instances are ephemeral, so
// this is a soft guard, not a hard quota. For production-grade limiting back it
// with a shared store (e.g. Upstash Redis / Vercel KV) — see README.
const RATE_MAX   = 20;             // requests …
const RATE_WIN_MS = 60 * 1000;     // … per minute per IP
const rateBuckets = new Map();     // ip -> { count, resetAt }

// ── System prompt: the Mandarin learning coach persona ──────────────────────
const SYSTEM_PROMPT = `You are 老师 (Lǎoshī), a warm, encouraging Mandarin Chinese tutor built into a Chinese-learning app called Hànlù (汉语之旅). Your student is learning Mandarin (HSK levels and everyday Duolingo-style vocabulary).

How you teach:
- Be concise and friendly. Prefer short, scannable answers over long essays. Never dump a wall of text.
- For any Chinese you give, include hanzi, pinyin (with tone marks), and the English meaning, e.g. 你好 (nǐ hǎo) — hello.
- When explaining grammar, give the rule in one or two plain sentences, then ONE short example. Avoid jargon.
- When the student asks for practice, make a tiny exercise (3–5 items) and offer to check their answers.
- When correcting the student's Chinese, be gentle: show what they wrote, the corrected version, and a one-line why.
- If the student writes in pinyin only, give the hanzi too.
- Adapt difficulty to the student. Beginners get simpler words and more English; ask their level if it matters.
- Use a little Markdown (bold, short bullet lists) but keep it light. Use emoji sparingly (at most one).
- Stay on topic: Mandarin learning. If asked something unrelated, gently steer back.
- Never invent fake HSK levels or wrong pinyin. If unsure about a tone or character, say so briefly.`;

// ── CORS ────────────────────────────────────────────────────────────────────
function resolveOrigin(req) {
  const fromEnv = (process.env.ALLOWED_ORIGINS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const defaults = [
    'https://qodirovskiye.github.io',
    'http://localhost:8777',
    'http://127.0.0.1:8777',
    'http://localhost:3000',
  ];
  const allow = fromEnv.length ? fromEnv : defaults;
  const origin = req.headers.origin || '';
  if (allow.includes('*')) return '*';
  if (allow.includes(origin)) return origin;
  return allow[0]; // fall back to the primary allowed origin
}
function setCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', resolveOrigin(req));
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}
function rateLimited(ip) {
  const now = Date.now();
  const b = rateBuckets.get(ip);
  if (!b || now > b.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WIN_MS });
    return false;
  }
  b.count += 1;
  return b.count > RATE_MAX;
}

// ── Validation ──────────────────────────────────────────────────────────────
function validateMessages(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: 'Body must include a non-empty "messages" array.' };
  }
  const trimmed = raw.slice(-MAX_MESSAGES);
  const messages = [];
  let total = 0;
  for (const m of trimmed) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) {
      return { error: 'Each message needs role "user" or "assistant".' };
    }
    const content = typeof m.content === 'string' ? m.content : '';
    if (!content.trim()) continue; // skip empties
    if (content.length > MAX_INPUT_CHARS) {
      return { error: `Each message must be under ${MAX_INPUT_CHARS} characters.` };
    }
    total += content.length;
    messages.push({ role: m.role, content });
  }
  if (messages.length === 0) return { error: 'No non-empty messages provided.' };
  if (messages[messages.length - 1].role !== 'user') {
    return { error: 'The last message must be from the user.' };
  }
  if (total > MAX_TOTAL_CHARS) {
    return { error: 'Conversation too long. Clear the chat and try again.' };
  }
  return { messages };
}

// ── Provider calls ──────────────────────────────────────────────────────────
async function callAnthropic(messages) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw httpError(500, 'Server missing ANTHROPIC_API_KEY.');
  const client = new Anthropic({ apiKey });
  const model = process.env.AI_MODEL || 'claude-opus-4-8';
  const resp = await client.messages.create({
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: SYSTEM_PROMPT,
    messages, // [{role:'user'|'assistant', content:string}]
  });
  return resp.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

async function callOpenAI(messages) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw httpError(500, 'Server missing OPENAI_API_KEY.');
  // Lazy import so the openai package is only needed when this provider is used.
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey });
  const model = process.env.AI_MODEL || 'gpt-4o-mini';
  const completion = await client.chat.completions.create({
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
  });
  return (completion.choices?.[0]?.message?.content || '').trim();
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// ── Handler ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please slow down a moment.' });
  }

  // Vercel parses JSON bodies automatically; be defensive for other runtimes.
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON body.' }); }
  }
  const { messages, error } = validateMessages(body?.messages);
  if (error) return res.status(400).json({ error });

  const provider = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
  try {
    const reply = provider === 'openai'
      ? await callOpenAI(messages)
      : await callAnthropic(messages);
    if (!reply) return res.status(502).json({ error: 'Empty reply from the AI provider.' });
    return res.status(200).json({ reply });
  } catch (err) {
    const status = err?.status && err.status >= 400 && err.status < 600 ? err.status : 502;
    // Don't leak internals to the client; log full detail server-side.
    console.error('[hanlu/api/chat]', err?.message || err);
    const msg = status === 429
      ? 'The AI provider is rate-limiting requests. Try again shortly.'
      : status >= 500 && status < 600 && err?.status
        ? 'The AI provider had an error. Try again shortly.'
        : (err?.message || 'Unexpected server error.');
    return res.status(status).json({ error: msg });
  }
}
