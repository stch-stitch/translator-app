# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # Start dev server (localhost:3000)
npm run build    # Production build
npm run lint     # ESLint check
npm run start    # Start production server
```

No test suite exists in this project.

## Environment Variables

| Variable | Purpose |
|---|---|
| `OLLAMA_API_URL` | Ollama server URL (default: `http://localhost:11434`) |
| `OLLAMA_MODEL` | Model to use (default: `gemma4:26b`) |
| `APP_SECRET` | Password for the app gate; if unset, auth is disabled |

## Architecture

Single-page translator app (Next.js 16 App Router) that streams EN→KR translation from a local/remote Ollama instance.

**Auth flow**: `app/page.tsx` reads a token from `sessionStorage`. If absent, renders `PasswordGate` (POST `/api/auth`). On success, the password itself becomes the Bearer token for subsequent requests.

**Translation flow**:
1. User pastes text (or extracts from PDF via `pdfjs-dist` in-browser)
2. Text is split into paragraphs (double-newline delimiter)
3. Each paragraph is sent sequentially to `POST /api/translate` with `Authorization: Bearer <token>`
4. The API route forwards to Ollama's `/api/generate` with `stream: true` using native `fetch` with an undici `Agent` dispatcher (TLS bypass via `rejectUnauthorized: false` — required for Funnel/ngrok tunnels)
5. Ollama's NDJSON stream is piped back as a `ReadableStream` of plain text chunks
6. `think: true` enables extended reasoning mode on the model

**State management**: All UI state lives in `components/AppContent.tsx` (no external store). Translation history persists to `localStorage` (`translator-history`). User instructions persist to `localStorage` (`translator-instructions`). Refs (`segmentsRef`, `abortRef`, `instructionsRef`, `tokenRef`) are used to capture latest values inside async loops without stale closures.

**Key files**:
- `app/page.tsx` — SSR-disabled entry point; hydration guard for sessionStorage
- `components/AppContent.tsx` — all UI: `PasswordGate`, `TranslatorApp`, `AppContent` (default export)
- `app/api/translate/route.ts` — Ollama proxy, streaming response
- `app/api/auth/route.ts` — password validation against `APP_SECRET`

## Notable Constraints

- `AppContent` is dynamically imported with `ssr: false` to avoid `pdfjs-dist` Node.js incompatibilities
- The undici `Agent` dispatcher with `rejectUnauthorized: false` is intentional for self-signed certs on tunnel endpoints (Funnel, ngrok)
- Translation is sequential (one paragraph at a time), not concurrent — this is by design to preserve order and avoid overwhelming the model
