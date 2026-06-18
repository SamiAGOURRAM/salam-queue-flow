# QueueMed

> **AI-assisted healthcare queue-management & booking platform for clinics in Morocco.**
> Multi-clinic, multi-role (patient / staff / clinic owner), trilingual (FR / AR / EN), with a built-in AI assistant that performs **real, permission-checked actions** — not just chat.

<p>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React_18-149ECA?logo=react&logoColor=white">
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=white">
  <img alt="Model Context Protocol" src="https://img.shields.io/badge/MCP-tool_calling-7C3AED">
  <img alt="Monorepo" src="https://img.shields.io/badge/Turborepo-pnpm-EF4444">
</p>

QueueMed turns the everyday clinic problem — *long, opaque waiting lines* — into a real-time, bookable queue, and puts a natural-language assistant in front of it that can search doctors, check availability, book, and report queue position **on the patient's behalf, bounded by exactly what that patient is allowed to do.**

> Built as a portfolio-grade systems project: a clean **hexagonal core**, an **AI agent with provable tool-parity to the UI**, and authorization enforced **in the data layer** (Postgres RLS), not by which tools the model can see. The architectural reasoning lives in [`STRATEGY.md`](./STRATEGY.md).

---

## Highlights — what this project demonstrates

- **An AI agent that's a front-end to real operations, not a toy.** The chatbot drives the *same* domain operations as the UI through [Model Context Protocol](https://modelcontextprotocol.io) tools. Its blast radius is provably ⊆ the signed-in user's: every tool runs with the user's own JWT and is gated by Postgres **Row-Level Security**, so the LLM can never exceed the user's permissions. ([why this matters →](./STRATEGY.md#2-the-ai-agent-is-not-a-privileged-actor--it-has-tool-parity-with-the-web-app))
- **Hexagonal architecture (Ports & Adapters), enforced.** All business logic lives in `@queuemed/core` and depends only on interfaces; Supabase/Auth/messaging are swappable adapters wired at one composition root. A boundary **test fails CI** if a core service ever imports infrastructure.
- **Security thinking, explicit.** Per-request JWT scoping, role-based tool visibility (`tools/list` only returns tools the caller may use), human-in-the-loop confirmation on irreversible actions, and a documented analysis of the LLM "lethal trifecta."
- **Real product surface.** Doctor-first discovery with live typeahead + IP geolocation, slotted / fluid / hybrid queue modes, ML wait-time estimates, trilingual UI with full RTL Arabic, and a clinic console (queue, calendar, consultations, prescriptions).
- **Tested & typed.** Vitest unit suites across web / core / server, a deterministic **RBAC matrix eval** for the agent's authorization, and a fully type-checked monorepo.

---

## Demo

- ▶️ **Live demo:** _add your deployed URL here_ (see [Deployment](#deployment-public-showcase)) — or run the whole stack locally with one command (see [Local development](#local-development)).
- The assistant runs in **mock mode without any API key**, so the full UI + tool plumbing is explorable offline; add a free Groq key for live, tool-powered answers.

> _Screenshots / a short walkthrough GIF go well here for a portfolio — drop them in a `docs/` folder and link them._

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

---

## Project layout

```
apps/
  web/         React SPA (patient + clinic console)
  chat-api/    AI agent — Vercel AI SDK tool-calling loop over MCP
  mcp-server/  MCP server — RBAC-gated domain tools (Streamable HTTP + stdio)
packages/
  core/        @queuemed/core — hexagonal business logic (services + ports)
supabase/      Postgres schema, RLS policies, migrations, RPCs
STRATEGY.md    Technical north star (architecture decisions & consolidation plan)
```

---

## Author

Built by **Sami Agourram**. Architecture & engineering notes in [`STRATEGY.md`](./STRATEGY.md).
This repository is a personal portfolio / showcase project.
