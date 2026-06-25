# Hànlù 汉语之旅 — Chinese learning app

A free, single-page Chinese-learning web app: HSK 1–3 + the full Duolingo Mandarin
vocabulary as smart flashcards (pinyin tone colors, audio, spaced review), an
**AI Mandarin tutor**, streaks, themes, and a live leaderboard.

**Live:** https://qodirovskiye.github.io/hanlu/

The app is a single static `index.html` (no build step) deployed on GitHub Pages.
The AI tutor talks to a tiny serverless backend (`api/chat.js`) so your API key
never ships to the browser.

---

## What's in here

| Path | What it is |
|------|------------|
| `index.html` | The entire frontend — UI, flashcard engine, HSK + Duolingo decks, AI tutor UI, themes, leaderboard. |
| `api/chat.js` | Serverless AI-tutor endpoint (`POST /api/chat`). Anthropic Claude by default, OpenAI switchable. Keeps the API key server-side. |
| `package.json` | Declares the backend's SDK dependencies (for Vercel). |
| `vercel.json` | Vercel function config. |
| `.env.example` | The environment variables the backend needs. Copy to `.env.local`. |

---

## What was added (AI tutor + engagement)

- **🤖 AI Tutor tab** — a chat coach: explains words/grammar with hanzi + pinyin + English,
  quizzes you, corrects your sentences, makes practice drills. Chat history is saved
  in `localStorage`, with suggested-prompt chips, loading/error states, a clear button,
  and a **local daily message limit** so you don't accidentally burn API credits.
- **Demo mode** — with no backend configured, the tutor returns sample replies and shows
  a friendly "connect a backend" banner, so the UI is fully testable offline.
- **Daily Challenge** — a deterministic "word of the day" on the home page, with audio and
  a one-tap "Ask the AI tutor" shortcut.
- **Share button** — native share / copy-to-clipboard ("I'm learning Chinese with Hànlù…").
- **SEO + social** — title, meta description, Open Graph + Twitter card tags, theme-color.
- Analytics events fire through the existing `gtag` wrapper **only if `gtag` exists**.

Existing HSK/Duolingo flashcards, progress, streaks, themes and leaderboard are unchanged.

---

## Run locally

No build step. Serve the folder over HTTP (localStorage needs http/https, not `file://`):

```bash
python3 -m http.server 8777 --bind 127.0.0.1
# then open http://127.0.0.1:8777/
```

Locally the AI tutor runs in **demo mode** (sample replies) unless you point it at a
deployed backend in the tutor's ⚙️ settings.

---

## Deploy the frontend

It's already on **GitHub Pages** (served from `main` at the repo root). Push to `main`
and Pages redeploys automatically. Nothing else is required for the flashcards.

---

## Deploy the backend (AI tutor) — Vercel

GitHub Pages can't run server code, so the tutor's API lives on Vercel.

1. **Create a Vercel project** from this repo (or a copy):
   ```bash
   npm i -g vercel    # once
   vercel             # from the repo root → follow prompts
   ```
   Vercel auto-detects `api/chat.js` as a serverless function and installs the
   dependencies in `package.json`.

2. **Add your API key** in Vercel → **Project → Settings → Environment Variables**:

   | Name | Value |
   |------|-------|
   | `AI_PROVIDER` | `anthropic` |
   | `ANTHROPIC_API_KEY` | your key from console.anthropic.com |
   | `AI_MODEL` | *(optional)* e.g. `claude-haiku-4-5` for cost (see below) |

   Then **redeploy** (`vercel --prod`) so the variables take effect.

3. **Connect the frontend to it:** open the app → **🤖 AI Tutor → ⚙️** → paste your
   Vercel base URL (e.g. `https://your-app.vercel.app`) → Save. The app calls
   `<url>/api/chat`. (This is stored in your browser's localStorage.)

> **Tip — all-in-one option:** if you deploy the *whole repo* to Vercel (frontend + API
> together), the tutor auto-detects the same-origin `/api/chat` and you don't need to paste
> a URL at all.

### Local backend dev

```bash
cp .env.example .env.local   # fill in ANTHROPIC_API_KEY
vercel dev                   # serves the frontend + /api/chat on localhost
```

---

## Environment variables

Set these on the backend host (Vercel), never in the frontend. See `.env.example`.

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `AI_PROVIDER` | no | `anthropic` | `anthropic` or `openai` |
| `ANTHROPIC_API_KEY` | when provider=anthropic | — | from console.anthropic.com |
| `OPENAI_API_KEY` | when provider=openai | — | from platform.openai.com |
| `AI_MODEL` | no | `claude-opus-4-8` / `gpt-4o-mini` | model id override |
| `ALLOWED_ORIGINS` | no | Pages + localhost | comma-separated CORS allowlist |

---

## Switch AI provider / model

- **Provider:** set `AI_PROVIDER=openai` (and `OPENAI_API_KEY`) to use OpenAI instead of Claude. Redeploy.
- **Model:** set `AI_MODEL`. Anthropic options: `claude-opus-4-8` (top quality),
  `claude-sonnet-4-6` (balanced), `claude-haiku-4-5` (cheapest). OpenAI: e.g. `gpt-4o-mini`.

---

## Controlling cost

A vocabulary tutor doesn't need the most expensive model. To keep spend low:

1. **Use a cheaper model:** `AI_MODEL=claude-haiku-4-5` (~5× cheaper than Opus, still great).
2. **Output is capped** server-side (`MAX_OUTPUT_TOKENS` in `api/chat.js`, default 800).
3. **Per-IP rate limiting** (`RATE_MAX`/`RATE_WIN_MS`) is on by default (best-effort; for a
   hard quota, back it with Vercel KV / Upstash Redis — see the comment in `api/chat.js`).
4. **Local daily message cap** in the UI (`TUTOR.DAILY_LIMIT`, default 40) warns and blocks
   before you over-spend during normal use.
5. Set a **spend limit** in your Anthropic/OpenAI billing console as a backstop.

---

## Security notes

- The API key lives **only** in the backend's environment variables — never in `index.html`,
  never committed. `.env` / `.env.local` are gitignored.
- The backend validates input (roles, per-message and total length), caps output, and
  rate-limits per IP.
- CORS is restricted to the Pages origin + localhost by default (`ALLOWED_ORIGINS` to change).
