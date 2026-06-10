# QueueMed

AI-assisted healthcare **queue management & booking** platform for clinics in Morocco — multi-clinic, multi-role (patient / staff / clinic owner), trilingual (FR / AR / EN), with a built-in AI assistant that performs real actions through **permission-checked tools**.

> Monorepo: **pnpm** workspaces + **Turborepo**. Frontend on Vite/React, backends on Node/TypeScript, data on Supabase (Postgres + Auth + RLS).

---

## Architecture

```
┌──────────────┐     Supabase JWT      ┌───────────────┐   MCP (HTTP)   ┌────────────────┐
│   apps/web    │ ───── data ─────────▶ │   Supabase     │               │  apps/mcp-server│
│ React SPA     │                       │ Postgres+Auth  │               │  11 RBAC tools  │
│ (Vite)        │ ── chat (JWT) ──┐     └───────────────┘        ┌──────▶ │  Streamable HTTP│
└──────────────┘                 │                              │        └────────────────┘
                                  ▼                              │ forwards JWT → per-user
                          ┌────────────────┐   AI SDK agent      │ guardrails (assertToolAccess)
                          │ apps/chat-api   │ ── tool calls ──────┘
                          │ Vercel AI SDK   │
                          │ (Groq default)  │
                          └────────────────┘
```

- **`apps/web`** — React SPA. Talks directly to Supabase for data; talks to `chat-api` for the AI assistant.
- **`apps/chat-api`** — the AI chatbot agent. Validates the user's Supabase JWT, runs a Vercel AI SDK tool-calling loop (provider-agnostic; **Groq** by default, with a mock fallback so it runs without a key), and drives the MCP tools.
- **`apps/mcp-server`** — Model Context Protocol server exposing 11 domain tools (clinic search, availability, booking, queue position/schedule/call-next, patient profile/appointments, ML wait-time). Runs over **Streamable HTTP** (and stdio for desktop MCP clients). Validates the forwarded JWT and **enforces role-based access per tool** — `tools/list` only returns tools the caller may use, and every call is checked with `assertToolAccess`.
- **`packages/core`** — shared business logic / contracts used by web + mcp-server.

### Auth guardrails (the important part)
The chatbot can only ever do what the **signed-in user** is allowed to do:
1. The browser sends the Supabase session JWT to `chat-api`.
2. `chat-api` forwards it to the MCP server on every tool request.
3. The MCP server resolves the JWT → `AuthContext` (role, clinic, patient) and gates each tool. Anonymous callers see **3 public tools**; authenticated users see the tools their role permits. There is no path for the LLM to exceed the user's permissions.

---

## Local development

Prereqs: Docker, and a Supabase project (hosted, or local via the Supabase CLI).

```bash
cp .env.example .env       # fill in SUPABASE_* and (optionally) GROQ_API_KEY
docker compose up --build
```

| Service     | URL                         | Notes                                  |
|-------------|-----------------------------|----------------------------------------|
| web         | http://localhost:8080       | React SPA (hot reload)                 |
| chat-api    | http://localhost:8787       | `/health`, `POST /api/chat`            |
| mcp-server  | http://localhost:3001       | `/health`, `POST /mcp`                 |

Without `GROQ_API_KEY` the chatbot runs in **mock mode** (the UI and tool plumbing still work). Add a key (free at [console.groq.com](https://console.groq.com)) to enable live, tool-powered answers.

### Run services individually (no Docker)
```bash
pnpm install
pnpm --filter @queuemed/mcp-server dev:http   # :3001
pnpm --filter @queuemed/chat-api  dev          # :8787
pnpm --filter @queuemed/web       dev          # :8080
```

---

## Environment

See [`.env.example`](./.env.example). Key variables:

| Variable | Service | Purpose |
|----------|---------|---------|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | web | Supabase client (anon) |
| `VITE_CHAT_API_URL` | web | Where the chat widget posts |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | mcp-server | Server-side data + JWT validation |
| `GROQ_API_KEY` / `LLM_PROVIDER` | chat-api | LLM (else mock mode) |
| `MCP_SERVER_URL` | chat-api | MCP endpoint to drive |

---

## Deployment (public showcase)

**Backend → DigitalOcean App Platform** (both Node services from one spec):
```bash
doctl apps create --spec .do/app.yaml
```
Set `SUPABASE_SERVICE_KEY` and `GROQ_API_KEY` as encrypted secrets, and `FRONTEND_ORIGIN` to your frontend URL. `chat-api` is public; `mcp-server` is internal-only and reached via its private URL.

**Frontend → Vercel / Netlify** (static):
- Build: `pnpm --filter @queuemed/web build` → output `apps/web/dist`
- Set build-time `VITE_*` vars, including `VITE_CHAT_API_URL` = the deployed chat-api URL.

---

## Testing

```bash
pnpm typecheck                                   # all workspaces
pnpm --filter @queuemed/web test                  # web unit tests (vitest)
pnpm --filter @queuemed/chat-api exec tsx scripts/smoke-mcp.mts   # MCP transport + RBAC scoping
```

---

## Tech stack

React 18 · Vite · TypeScript · Tailwind · Radix UI · TanStack Query · Supabase (Postgres/Auth/RLS) · Model Context Protocol · Vercel AI SDK · Groq · Express · Turborepo · pnpm · Docker.
