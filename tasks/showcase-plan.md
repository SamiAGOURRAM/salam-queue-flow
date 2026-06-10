# Goal: Portfolio showcase — functional AI chatbot (MCP + auth guardrails), cleanup, deploy-ready

Branch: `feat/showcase-ai-chatbot`

## Decisions (locked with user)
- Chatbot engine: **Vercel AI SDK** TS agent backend → consumes existing `apps/mcp-server` tools via MCP, enforces Supabase-JWT auth + RBAC. **Drop CUGA + dead `server/` stub.**
- LLM provider: **Groq** default (provider-agnostic + mock fallback so it runs with no key).
- Cleanup: **aggressive** (delete analysis docs, stray CSVs, tmp sql, npm lock, .skill).
- Hosting (configs only; real deploy needs user creds): backend → DigitalOcean App Platform; frontend → Vercel/Netlify static.

## Phase 1 — Cleanup (safe, reversible via git)
- [ ] Delete `docs/*` analysis cruft + `docs/user_roles_rows.csv`
- [ ] Delete dead `server/` Express+BeeAI stub
- [ ] Delete root junk: `package-lock.json`, `clinics_rows.csv`, `queue_overrides_rows.csv`, `tmp_rls_smoke.sql`, `premium-healthcare-redesign.skill`
- [ ] Keep `CLAUDE.md`, `tasks/`, `features.md`; add real top-level `README.md`

## Phase 2 — MCP server: real guardrails + network transport
- [ ] Streamable HTTP transport in `apps/mcp-server` (keep stdio)
- [ ] HTTP transport reads `Authorization: Bearer <jwt>` → `validateToken` → `AuthContext`
- [ ] Wire `executeToolCall(name, args, context)` (currently anonymous)
- [ ] `tools/list` scoped via `getAccessibleTools`; add `/health`

## Phase 3 — `apps/chat-api` (new workspace pkg)
- [ ] HTTP server, POST `/api/chat` (stream), validates Supabase JWT
- [ ] AI SDK agent loop, provider-agnostic (Groq default), mock fallback
- [ ] MCP client (HTTP) forwarding user JWT → guardrails enforced
- [ ] Healthcare-domain system prompt guardrails
- [ ] Dockerfile + DO app spec

## Phase 4 — Frontend: swap CUGA → chat-api
- [ ] `ApiChatService` (calls chat-api with supabase JWT, streams)
- [ ] Update factory + env; keep `MockChatService` fallback

## Phase 5 — Deploy configs + docs
- [ ] compose (dev+prod) include `chat-api` + `mcp-server` http
- [ ] DigitalOcean `app.yaml`; `.env.example` (GROQ_API_KEY, SUPABASE_SERVICE_KEY, VITE_CHAT_API_URL)

## Phase 6 — Test
- [ ] `pnpm typecheck` + `pnpm build` green
- [ ] docker compose up → web/chat-api/mcp
- [ ] smoke: anon chat (public tools), authed chat (scoped), guardrail denial

## Blocked-on-user
- GROQ_API_KEY (live AI), SUPABASE_SERVICE_KEY (server JWT validation), DO + frontend host accounts (public deploy)

## Review (2026-06-02)
- **Phase 1 cleanup** ✅ — removed `docs/` (33 analysis md + csv), dead `server/` stub, `package-lock.json`, stray CSVs, `tmp_rls_smoke.sql`, `.skill`. Added top-level `README.md`. Kept `CLAUDE.md`, `tasks/`, `features.md`.
- **Phase 2 MCP guardrails** ✅ — added `requestContext.ts` (AsyncLocalStorage), wired `server.ts` to resolve per-request `AuthContext` and scope `tools/list` via `getAccessibleTools` + pass context to `executeToolCall`. Added Streamable HTTP transport (`http.ts`, `/mcp` + `/health`) + express dep + `dev:http`/`start:http` scripts.
- **Phase 3 chat-api** ✅ — new `apps/chat-api` (Vercel AI SDK v5, Groq default, provider-agnostic, mock fallback). MCP client forwards JWT. `POST /api/chat` streams text; `/health`. typecheck clean.
- **Phase 4 frontend** ✅ — `ApiChatService` (sends Supabase JWT, streams), rewrote factory, deleted `CugaChatService`, removed CUGA copy. web typecheck + build green.
- **Phase 5 deploy** ✅ — `Dockerfile.chat`, `Dockerfile.mcp` (now http), dev+prod compose include all 3 services, `.do/app.yaml`, rewrote `.env.example`.
- **Phase 6 test** ✅ (what's possible without secrets):
  - typecheck: chat-api, mcp-server, web all clean; web build ✓
  - both compose files validate
  - MCP HTTP smoke: anonymous caller sees ONLY 3 public tools (RBAC scoping live), tool dispatch executes end-to-end
  - chat-api mock chat returns a reply
- **Blocked-on-user (cannot complete autonomously):** GROQ_API_KEY (live AI), SUPABASE_SERVICE_KEY + outbound network (authed tool data), DigitalOcean + frontend-host accounts/DNS (actual public deploy).
