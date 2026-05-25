# CLAUDE.md — GeminiProChat

## Project Overview

GeminiProChat is a minimal web UI for chatting with Google's Gemini Pro API. It is a server-side-rendered application built with **Astro**, **SolidJS** (for reactive UI components), and **UnoCSS** (utility-first styling). The app supports streaming responses, markdown/LaTeX/code rendering, optional password protection, and deployment to Node, Vercel, and Netlify.

---

## Repository Structure

```
GeminiProChat/
├── src/
│   ├── pages/
│   │   ├── index.astro          # Main chat page
│   │   ├── password.astro       # Password gate page
│   │   └── api/
│   │       ├── generate.ts      # POST /api/generate — streams Gemini responses
│   │       └── auth.ts          # POST /api/auth — validates site password
│   ├── components/
│   │   ├── Generator.tsx        # Core chat UI (SolidJS): input, message list, streaming
│   │   ├── MessageItem.tsx      # Renders a single message with markdown/KaTeX/hljs
│   │   ├── ErrorMessageItem.tsx # Renders API errors inline
│   │   ├── SystemRoleSettings.tsx # System prompt + temperature slider UI
│   │   ├── SettingsSlider.tsx   # Reusable slider using @zag-js/slider
│   │   ├── Slider.tsx           # Low-level slider wrapper
│   │   ├── Header.astro         # App header with logo and theme toggle
│   │   ├── Footer.astro         # Footer
│   │   ├── Logo.astro           # SVG logo
│   │   ├── Themetoggle.astro    # Dark/light mode toggle
│   │   └── icons/               # SVG icon components (SolidJS)
│   ├── utils/
│   │   ├── openAI.ts            # Gemini API client: startChatAndSendMessageStream()
│   │   └── auth.ts              # generateSignature() / verifySignature() (SHA-256)
│   ├── layouts/
│   │   └── Layout.astro         # Base HTML shell, theme init, PWA manifest
│   ├── types.ts                 # ChatMessage, ChatPart, ErrorMessage interfaces
│   ├── env.d.ts                 # Astro env type declarations
│   ├── message.css              # Message prose/copy-button styles
│   └── slider.css               # Slider component styles
├── plugins/
│   └── disableBlocks.ts         # Vite plugin: strips #vercel-disable-blocks sections
├── hack/
│   ├── docker-entrypoint.sh     # Container startup: runs env-replace then node server
│   └── docker-env-replace.sh    # Injects runtime env vars into the built bundle
├── public/                      # Static assets: icons, PWA images
├── astro.config.mjs             # Astro config: adapters, integrations, PWA setup
├── unocss.config.ts             # UnoCSS presets and shortcut definitions
├── tsconfig.json                # TypeScript config (paths alias @/* → src/*)
├── package.json                 # Scripts and dependencies
├── Dockerfile                   # Node 18 Alpine image
├── docker-compose.yml           # Docker Compose with env vars
├── vercel.json                  # Vercel build command
└── netlify.toml                 # Netlify build config
```

---

## Environment Variables

Copy `.env.example` to `.env` and populate:

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `API_BASE_URL` | No | Custom base URL for Gemini API (default: `https://generativelanguage.googleapis.com`) |
| `PUBLIC_SECRET_KEY` | No | Secret used for HMAC-style request signatures (prevents abuse in production) |
| `SITE_PASSWORD` | No | Comma-separated passwords. If unset, site is public |
| `PUBLIC_MAX_HISTORY_MESSAGES` | No | Max messages sent as context (default: 99) |
| `HEAD_SCRIPTS` | No | Raw HTML injected before `</head>` (analytics, etc.) |

`PUBLIC_*` variables are exposed to the client-side bundle. All others are server-only.

---

## Development Workflow

### Prerequisites
- Node.js 18+
- pnpm 7.28+

### Setup
```bash
pnpm install
cp .env.example .env   # fill in GEMINI_API_KEY at minimum
pnpm dev               # starts Astro dev server (default: http://localhost:4321)
```

### Available Scripts
```bash
pnpm dev              # development server with HMR
pnpm build            # build for Node (standalone SSR)
pnpm build:vercel     # build with OUTPUT=vercel
pnpm build:netlify    # build with OUTPUT=netlify
pnpm preview          # preview production build locally
pnpm lint             # ESLint across .js/.jsx/.ts/.tsx/.astro
pnpm lint:fix         # ESLint with auto-fix
```

### Path Alias
`@/` maps to `src/`. Use `import type { ChatMessage } from '@/types'` rather than relative paths.

---

## Architecture & Key Patterns

### Adapter Selection
`astro.config.mjs` selects the SSR adapter based on the `OUTPUT` env var:
- `OUTPUT=vercel` → `@astrojs/vercel/edge`
- `OUTPUT=netlify` → `@astrojs/netlify/edge-functions`
- (default) → `@astrojs/node` standalone

### Streaming Response
`/api/generate.ts` calls `startChatAndSendMessageStream()` (`src/utils/openAI.ts`), which uses the `@fuyun/generative-ai` SDK to call `chat.sendMessageStream()`. The result is a `ReadableStream` piped directly to the HTTP response. `Generator.tsx` reads chunks via `ReadableStream.getReader()` and appends each decoded character to `currentAssistantMessage` signal.

### Request Signing
In production (`import.meta.env.PROD`), every `/api/generate` request is verified server-side using `verifySignature()`. The client signs `${timestamp}:${lastMessageText}:${PUBLIC_SECRET_KEY}` with SHA-256. This is a replay-prevention mechanism, not authentication — it ties requests to a known secret.

### Message History
Conversation state is kept in a SolidJS signal (`messageList`) and persisted to `localStorage`. On each request, history is sliced to `PUBLIC_MAX_HISTORY_MESSAGES` and passed to the Gemini API. `convertReqMsgList()` in `Generator.tsx` enforces strict user/model turn alternation required by the Gemini API.

### Message Role Mapping
Gemini API uses `"model"` and `"user"` roles. The `ChatMessage` type in `src/types.ts` uses `"model" | "user"`. In `Generator.tsx`, outgoing messages convert `"assistant"` → `"model"` when building the request payload.

### Markdown Rendering
`MessageItem.tsx` renders messages with `markdown-it` + `markdown-it-katex` (LaTeX) + `markdown-it-highlightjs` (syntax highlighting). Code blocks get an injected copy button using `encodeURIComponent(token.content)` stored in a `data-code` attribute.

### Theme
Dark/light mode is managed via the `dark` class on `<html>`. Initial state is determined from `localStorage` or `prefers-color-scheme`. CSS custom properties `--c-bg` and `--c-fg` drive the color scheme in `Layout.astro`.

### UnoCSS Shortcuts
`unocss.config.ts` defines application-wide utility shortcuts (e.g., `gen-textarea`, `gpt-copy-btn`, `gen-slate-btn`). Always check these before writing inline classes. Key shortcuts:
- `fc` / `fi` / `fb` / `fcc` — flex layout helpers
- `gen-textarea` — styled textarea for the input box
- `gen-slate-btn` — standard action button
- `gpt-retry-btn` — retry/regenerate button style

---

## API Endpoints

### `POST /api/auth`
Validates a site password. Returns `{ code: 0 }` on success, `{ code: -1 }` on failure. No authentication required to call this endpoint.

### `POST /api/generate`
Streams a Gemini Pro response.

**Request body:**
```json
{
  "messages": [{ "role": "user", "parts": [{ "text": "..." }] }],
  "time": 1234567890,
  "pass": "optional-site-password",
  "sign": "sha256-hex-string"
}
```
**Response:** `text/plain` stream of response tokens, or JSON error `{ error: { code, message } }`.

---

## Docker Deployment

```bash
# Build and run
docker-compose up --build

# Environment variables set in docker-compose.yml
# GEMINI_API_KEY is required; others are optional
```

The `hack/docker-env-replace.sh` script rewrites env vars into the built bundle at container startup, allowing runtime configuration without rebuilding the image.

---

## Deployment Targets

| Target | Command | Notes |
|---|---|---|
| Node (self-hosted) | `pnpm build` | Outputs `dist/server/entry.mjs` |
| Vercel | `pnpm build:vercel` | Edge runtime; `disableBlocks` plugin strips incompatible code |
| Netlify | `pnpm build:netlify` | Edge functions; same plugin applied |
| Docker | `docker-compose up --build` | Node 18 Alpine; runtime env injection |

---

## Code Conventions

- **Framework split:** Static structure/layout in `.astro` files; interactive UI in SolidJS `.tsx` components with `client:load`
- **No React:** Despite ESLint referencing `react/` rules (from the shared config), this project uses SolidJS. Do not import from `react`
- **Signals over stores:** Prefer `createSignal` for component state; use `createEffect` for reactive side effects
- **No `console.log`:** ESLint disallows it; only `console.error` is permitted
- **TypeScript paths:** Always use `@/` alias, never relative paths like `../../utils/`
- **Styling:** Use UnoCSS utility classes and defined shortcuts. Avoid arbitrary inline styles. Check `unocss.config.ts` shortcuts before writing new class combinations
- **No test suite:** There are no unit or integration tests in this project. Validate changes manually

---

## Known Limitations / TODOs

- **Image upload** is stubbed — `handlePictureUpload` in `Generator.tsx` shows a "Coming soon" modal and does nothing
- **`SystemRoleSettings`** component exists but is not wired into `Generator.tsx` — system prompt functionality is incomplete
- **`SettingsSlider` / `Slider`** components exist but temperature control is only partially integrated
- **Timestamp verification** in `verifySignature` is commented out — the 5-minute replay window check is disabled
