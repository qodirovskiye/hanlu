# Hànlù 汉语之旅 — Chinese learning app

A free, single-page Chinese-learning web app: HSK 1–3 + the full Duolingo Mandarin
vocabulary as smart flashcards (pinyin tone colors, audio, spaced review), a
**free in-browser AI Mandarin tutor**, streaks, themes, and a live leaderboard.

**Live:** https://qodirovskiye.github.io/hanlu/

The app is a single static `index.html` (no build step) deployed on GitHub Pages.
The AI tutor runs an open LLM **locally in your browser** via
[WebLLM](https://github.com/mlc-ai/web-llm) + WebGPU — **no API key, no server, $0 per message.**

---

## What's in here

| Path | What it is |
|------|------------|
| `index.html` | The entire frontend — UI, flashcard engine, HSK + Duolingo decks, the **local AI tutor** (WebLLM), themes, leaderboard. |
| `api/chat.js` | **Optional / advanced.** A paid hosted backend (Claude/OpenAI). Not used by default; safe to ignore or delete. |
| `package.json`, `vercel.json`, `.env.example` | Config for the **optional** paid backend only. The app needs none of these to run. |

---

## AI Tutor — free, local, $0

The tutor is your Mandarin coach: explains words/grammar with **hanzi + pinyin + English**,
quizzes you, corrects your sentences, makes short practice drills. It uses suggested-prompt
chips, saves chat history in `localStorage`, and shows clean loading/error states.

**How it works:** open the **🤖 AI Tutor** tab and click **"Start local AI tutor."** The
first time, a small open model downloads to your device (a few hundred MB; cached afterwards),
then runs entirely in your browser over WebGPU. Nothing is sent to any server, and there is no
per-message cost.

> "This free AI runs locally in your browser. The first load downloads the model to your device.
> No API key is used."

**Default model:** `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` (a small Qwen instruct model — good at
Chinese, realistic on normal laptops). To change it, edit **`LOCAL_TUTOR_MODEL_ID`** in the
WebLLM `<script type="module">` near the bottom of `index.html`. Lighter/heavier options are
listed in the comment there (e.g. `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` for slower devices).

### Requirements & limitations (please read)

- **Modern browser with WebGPU** — recent desktop **Chrome or Edge** (Safari/Firefox support is
  improving). On unsupported browsers/devices the tutor shows a friendly notice and **demo mode**
  (sample replies); flashcards, Duolingo and daily challenges keep working.
- **First load downloads the model** (a few hundred MB). It's cached for next time.
- **Slower and weaker than Claude/OpenAI.** It's a small model running on your device, so it can
  make mistakes and won't match a big cloud model — answers are kept short on purpose. Double-check
  important details.
- Best on a laptop/desktop with a few GB of free RAM/VRAM.

### Engagement extras

- **Daily Challenge** — a deterministic "word of the day" with audio and a one-tap "Ask the AI tutor."
- **Share** — native share / copy-to-clipboard.
- **SEO** — title, meta description, Open Graph + Twitter tags.

Existing HSK/Duolingo flashcards, progress, streaks, themes and leaderboard are unchanged.

---

## Run locally

No build step. Serve the folder over HTTP (localStorage + WebGPU need http/https, not `file://`):

```bash
python3 -m http.server 8777 --bind 127.0.0.1
# then open http://127.0.0.1:8777/
```

`localhost` is a secure context, so the local AI works there too (on a WebGPU browser).

## Deploy

It's already on **GitHub Pages** (served from `main` at the repo root). Push to `main` and Pages
redeploys automatically. **That's the whole deploy** — the AI tutor needs no backend.

---

## Optional / advanced: use a paid hosted backend

You almost certainly don't need this — the free local tutor works without it. It exists only if
you'd rather use a paid cloud model (e.g. Claude or OpenAI) instead of the in-browser one.

<details>
<summary>Show optional paid-backend setup</summary>

1. Deploy `api/chat.js` to **Vercel**:
   ```bash
   npm i -g vercel && vercel        # from the repo root
   ```
   Vercel auto-detects `api/chat.js` and installs `package.json` deps.
2. In **Vercel → Settings → Environment Variables**, set:
   - `AI_PROVIDER` = `anthropic` (or `openai`)
   - `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`)
   - `AI_MODEL` *(optional)* — e.g. `claude-haiku-4-5` to keep costs low
   - then `vercel --prod`.
3. In the app: **🤖 AI Tutor → ⚙️ → "Use a custom paid API backend"** → paste your Vercel URL.

The API key lives only in the backend's environment variables — never in the browser, never
committed (`.env`/`.env.local` are gitignored). The backend validates input, caps output, and
rate-limits per IP. **This path costs money per message; the default local tutor does not.**

</details>
