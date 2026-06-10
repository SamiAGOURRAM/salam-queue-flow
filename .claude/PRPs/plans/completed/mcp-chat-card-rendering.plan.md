# Plan: Chat renders clickable discovery cards (Phase 4)

## Summary
Make the chat actually display clickable doctor/clinic cards that deep-link into
`BookingFlow`. Per the locked decision, we **extend the existing custom chat
contract** (keep `IChatService` + `ChatWindow` + `MockChatService`): chat-api
side-channels the discovery tool's `cards` and returns a JSON envelope
`{ message, cards }`; the web parses it and renders new `<ClinicCard/>`/
`<DoctorCard/>` components whose click navigates to the code-minted `bookingHref`.

## User Story
As a **patient**, when I ask the chat "find a clinic in Casablanca" / "dermatologists
in Casablanca", I see tappable cards inline; tapping one opens `BookingFlow`
prefilled for that clinic/doctor — no leaving the conversation.

## Problem → Solution
- **Problem:** Phases 2–3 produce `cards` in the MCP tool result, but `chat-api/mcp.ts:56` `extractText()` flattens every tool result to a string and `agent.ts` streams plain text — so the structured `cards` never reach the browser, and the web (`ApiChatService` → `ChatWindow` → `MessageBubble`) only renders text.
- **Solution:** capture `cards` from each tool result into the MCP session (no change to what the model sees), return `{ message, cards }` JSON from chat-api, and render the cards in the web chat with deep-link components.

## Metadata
- **Complexity:** Large (~12 files: 5 chat-api, 7 web)
- **Source PRD:** `.claude/PRPs/prds/mcp-patient-discovery-cards.prd.md` — Phase 4 (depends: 2 ✅, 3 ✅)
- **Decisions locked:** extend existing `IChatService` contract (NOT `@ai-sdk/react useChat`); request/response (no token streaming); new shared card components.

## Mandatory Reading
| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `apps/chat-api/src/mcp.ts` | 19-67 | `extractText` flattens tool output; `execute` is where to side-channel `cards`; `McpSession` shape to extend. |
| P0 | `apps/chat-api/src/agent.ts` | 34-88 | The streaming response to convert to `res.json({message,cards})`; mock + MCP-down degrade paths to preserve. |
| P0 | `apps/web/src/services/chat/ApiChatService.ts` | 36-89 | Stream-accumulate to replace with `await response.json()`; JWT/turns handling to keep. |
| P0 | `apps/web/src/services/chat/ChatService.ts` | 6-24 | `ChatMessage` + `ChatResponse` to extend with `cards?`. |
| P0 | `packages/core/src/types/cards.ts` | 27-50 | `DiscoveryCards`, `ClinicCardItem`, `DoctorCardItem`, `bookingHref` the cards carry. |
| P1 | `apps/web/src/components/chat/ChatWindow.tsx` | 54-103, 144-161 | Where the assistant message is built (attach `cards`) + rendered; has `useLocation` (already inside Router). |
| P1 | `apps/web/src/components/chat/MessageBubble.tsx` | 1-50 | Renders a message; extend to render `cards`. (Has a LOCAL duplicate `ChatMessage` — switch to the shared type.) |
| P1 | `apps/web/src/components/booking/DoctorDirectory.tsx` | 60-129, 150-230 | MIRROR: `useNavigate`, card-list JSX/styling, how a listing maps to display. |
| P1 | `apps/chat-api/src/index.ts` | 53, 62-75 | Route calls `streamChatToResponse({messages,token,res})`; `res.json` pattern already used for health. |
| P2 | `apps/web/src/App.tsx` | 112 | Route `booking/:clinicId` (reads `staffId` from query) — the deep-link target. |
| P2 | `apps/chat-api/package.json` / `tsconfig.json` | scripts/exclude | NodeNext; no test runner + no `**/*.test.ts` exclude yet. |

## Patterns to Mirror (real snippets)

### MCP TOOL WRAP — SOURCE: apps/chat-api/src/mcp.ts:51-58
```ts
execute: async (args: unknown) => {
  const result = await client.callTool({ name: t.name, arguments: (args ?? {}) as Record<string, unknown> });
  return extractText(result.content);
},
```
Side-channel cards here: parse the extracted text; if it has `.cards`, stash on a session-scoped var. Keep returning the text to the model (model behavior unchanged).

### JSON RESPONSE — SOURCE: apps/chat-api/src/index.ts:53
```ts
res.json({ ... });
```
`agent.ts` returns `res.json({ message, cards })` instead of streaming text.

### FETCH + AUTH — SOURCE: apps/web/src/services/chat/ApiChatService.ts:54-58, 27-34
```ts
const response = await fetch(this.apiUrl, { method: "POST", headers, body: JSON.stringify({ messages: this.turns }) });
```
Keep the JWT header + `turns`; replace the stream reader with `const data = await response.json()`.

### NAVIGATE ON CLICK — SOURCE: apps/web/src/components/booking/DoctorDirectory.tsx (useNavigate)
```ts
import { useNavigate } from "react-router-dom";
const navigate = useNavigate();
// ... onClick={() => navigate(`/booking/${clinicId}?staffId=${staffId}`)}
```
Cards navigate to `item.bookingHref` directly (already `/booking/:clinicId?staffId=`), and call `onClose()` to dismiss the chat.

### MESSAGE APPEND — SOURCE: apps/web/src/components/chat/ChatWindow.tsx:83-90
```ts
const assistantMessage: ChatMessage = { id: ..., text: response.message, sender: "assistant", timestamp: response.timestamp };
setMessages((prev) => [...prev, assistantMessage]);
```
Add `cards: response.cards` to the assistant message.

## Files to Change
| File | Action | Justification |
|---|---|---|
| `apps/chat-api/src/mcp.ts` | UPDATE | side-channel `cards` into session; expose `getCollectedCards()`; pure `parseCards()` helper |
| `apps/chat-api/src/agent.ts` | UPDATE | return `{message, cards}` JSON (mock + MCP-down + error paths) |
| `apps/chat-api/src/mcp.test.ts` | CREATE | unit-test `parseCards` |
| `apps/chat-api/package.json` | UPDATE | add `vitest` devDep + `"test": "vitest run --passWithNoTests"` |
| `apps/chat-api/tsconfig.json` | UPDATE | add `"**/*.test.ts"` to `exclude` (lesson: keep tests out of dist) |
| `apps/web/src/services/chat/ChatService.ts` | UPDATE | `ChatMessage` + `ChatResponse` gain `cards?: DiscoveryCards` |
| `apps/web/src/services/chat/ApiChatService.ts` | UPDATE | parse JSON `{message, cards}` |
| `apps/web/src/services/chat/MockChatService.ts` | UPDATE | (Should) sample cards for "clinic"/"doctor" queries (demo) |
| `apps/web/src/components/chat/ChatWindow.tsx` | UPDATE | attach `cards`; pass `onClose` to card view |
| `apps/web/src/components/chat/MessageBubble.tsx` | UPDATE | render `cards` via `<DiscoveryCardsView/>`; use shared `ChatMessage` type |
| `apps/web/src/components/chat/DiscoveryCardsView.tsx` | CREATE | switch on `kind` → list of `ClinicCard`/`DoctorCard` |
| `apps/web/src/components/chat/ClinicCard.tsx` | CREATE | presentational + navigate(bookingHref) |
| `apps/web/src/components/chat/DoctorCard.tsx` | CREATE | presentational (incl. nextAvailableSlot) + navigate(bookingHref) |
| `apps/web/src/components/chat/cards.test.tsx` | CREATE | (Should) render + click-navigates test |

## NOT Building
- **No `@ai-sdk/react useChat`** — keep the `IChatService` abstraction (locked decision).
- **No token streaming** — request/response JSON (locked). `sendMessageStream`/`onDelta` may become a single full-text call.
- **No model-behavior change** — the model still receives tool output as text; cards are side-channeled.
- **No new MCP tools / no auth changes** — Phases 2/3/5 own those.
- **No BookingFlow changes** — it already reads `:clinicId` + `?staffId`.
- **No chat-api dependency on `@queuemed/core`** — chat-api forwards `cards` as opaque JSON; the web owns the `DiscoveryCards` type.

## Step-by-Step Tasks

### Task 1: Side-channel `cards` in mcp.ts
- **ACTION:** UPDATE `apps/chat-api/src/mcp.ts`.
- **IMPLEMENT:**
  - Add a pure helper `export function parseCards(text: string): unknown | undefined { try { const o = JSON.parse(text); return o && typeof o === "object" && "cards" in o && (o as any).cards ? (o as any).cards : undefined; } catch { return undefined; } }`
  - In `createMcpSession`: `let collectedCards: unknown | undefined;`. In `execute`, after `const text = extractText(result.content);`, do `const c = parseCards(text); if (c) collectedCards = c;` then `return text;` (unchanged model view; last card-bearing tool wins).
  - Extend `McpSession` with `getCollectedCards: () => unknown | undefined;` and return `getCollectedCards: () => collectedCards`.
- **MIRROR:** MCP TOOL WRAP.
- **GOTCHA:** keep returning `text` from execute — do NOT return the parsed object (preserves model behavior + avoids leaking structure into the prompt). `collectedCards` is per-session (one request), so no cross-request bleed.
- **VALIDATE:** `corepack pnpm --filter @queuemed/chat-api typecheck` → 0.

### Task 2: chat-api returns `{ message, cards }`
- **ACTION:** UPDATE `apps/chat-api/src/agent.ts`.
- **IMPLEMENT:**
  - Mock path: `res.json({ message: mockReply(...), cards: undefined })` (drop `text/plain` write). Keep `X-Chat-Mode` header.
  - LLM path: replace the `for await (chunk of result.textStream) res.write(chunk)` loop with `const message = await result.text;` then `res.json({ message, cards: session?.getCollectedCards() });`.
  - Error path: `if (!res.headersSent) res.status(502); res.json({ message: "⚠️ Sorry, I couldn't complete that request. Please try again.", cards: undefined });`
  - Remove the `text/plain` content-type header (let `res.json` set it).
- **MIRROR:** JSON RESPONSE.
- **GOTCHA:** `result.text` is a `Promise<string>` on the streamText result (AI SDK v5) — `await` it; the tool loop still runs (steps execute), so `collectedCards` is populated by the time `result.text` resolves. Keep the `finally { session.close() }`.
- **VALIDATE:** typecheck 0; `corepack pnpm --filter @queuemed/chat-api build`.

### Task 3: chat-api test runner + parseCards test
- **ACTION:** UPDATE `package.json` (+`vitest` devDep, `"test": "vitest run --passWithNoTests"`); UPDATE `tsconfig.json` exclude `"**/*.test.ts"`; CREATE `src/mcp.test.ts`.
- **IMPLEMENT:** test `parseCards`: a JSON string with `cards` → returns it; without `cards` → undefined; non-JSON → undefined; `cards: undefined`/empty → undefined.
- **MIRROR:** mcp-server's vitest setup (`apps/mcp-server/package.json` test script + tsconfig exclude).
- **GOTCHA:** lesson — a new co-located test needs the runner AND the `**/*.test.ts` tsconfig exclude, or it ships to `dist`.
- **VALIDATE:** `corepack pnpm --filter @queuemed/chat-api test` → pass; build emits no `*.test.*` in dist.

### Task 4: web chat contract gains `cards`
- **ACTION:** UPDATE `ChatService.ts`.
- **IMPLEMENT:** `import type { DiscoveryCards } from "@queuemed/core";`; add `cards?: DiscoveryCards;` to both `ChatMessage` and `ChatResponse`.
- **VALIDATE:** web tsc (Task 9).

### Task 5: ApiChatService parses JSON
- **ACTION:** UPDATE `ApiChatService.ts` `sendMessageStream`/`sendMessage`.
- **IMPLEMENT:** replace the stream reader with `const data = await response.json() as { message: string; cards?: DiscoveryCards }; const text = data.message ?? "";`. Return `{ message: text, cards: data.cards, timestamp }`. Keep token + `turns` push (`assistant` turn content = text). `onDelta`, if kept, fire once with the full text.
- **MIRROR:** FETCH + AUTH.
- **GOTCHA:** keep the JWT header + the `this.turns` history; only the body parsing changes.
- **VALIDATE:** web tsc.

### Task 6: Card components (new)
- **ACTION:** CREATE `ClinicCard.tsx`, `DoctorCard.tsx`, `DiscoveryCardsView.tsx` in `apps/web/src/components/chat/`.
- **IMPLEMENT:**
  - `ClinicCard({ item, onNavigate }: { item: ClinicCardItem; onNavigate?: () => void })` — Card with name, specialty, city; `onClick={() => { onNavigate?.(); navigate(item.bookingHref); }}` via `useNavigate`.
  - `DoctorCard({ item, onNavigate })` — name, specialization, clinicName, city, and `nextAvailableSlot` (render `item.nextAvailableSlot?.kind === "datetime" ? formatTime(value) : "Walk-in <date>"` — handle the discriminated union); same click→navigate.
  - `DiscoveryCardsView({ cards, onNavigate })` — `cards.kind === "doctor_cards" ? cards.items.map(DoctorCard) : cards.items.map(ClinicCard)`.
- **MIRROR:** NAVIGATE ON CLICK + DoctorDirectory card styling (Card/Badge/lucide icons).
- **IMPORTS:** `import type { DiscoveryCards, ClinicCardItem, DoctorCardItem } from "@queuemed/core";`
- **GOTCHA:** `nextAvailableSlot` is the `NextAvailableSlot` discriminated union (`{kind:"datetime"|"day", value}`) — branch on `kind`; never `new Date(value)` on a `day` value as a datetime. `bookingHref` is branded — use it as-is (it's already the route string); do NOT hand-build the URL.
- **VALIDATE:** web tsc.

### Task 7: Render cards in the message
- **ACTION:** UPDATE `MessageBubble.tsx`.
- **IMPLEMENT:** import the shared `ChatMessage` (from `@/services/chat`) replacing the local duplicate interface; after the text `<p>`, `if (message.cards) <DiscoveryCardsView cards={message.cards} onNavigate={onClose} />`. Accept an optional `onClose?: () => void` prop.
- **GOTCHA:** cards render only on assistant messages; the text bubble stays.
- **VALIDATE:** web tsc.

### Task 8: Wire ChatWindow
- **ACTION:** UPDATE `ChatWindow.tsx`.
- **IMPLEMENT:** add `cards: response.cards` to the assistant `ChatMessage` (line ~83); pass `onClose={onClose}` to `<MessageBubble>` so a card tap closes the chat then navigates.
- **MIRROR:** MESSAGE APPEND.
- **VALIDATE:** web tsc.

### Task 9: (Should) MockChatService demo cards + card test
- **ACTION:** UPDATE `MockChatService.ts`; CREATE `cards.test.tsx`.
- **IMPLEMENT:** in the mock, if the message matches /clinic|doctor/i, return a small hardcoded `DiscoveryCards` (use `buildBookingHref` from `@queuemed/core` for the href) so demo mode (no chat-api) shows the card UI. Test: render `DiscoveryCardsView` with a clinic_cards payload inside a `MemoryRouter`; assert a card renders and clicking triggers navigation to the `bookingHref`.
- **GOTCHA:** the mock's `bookingHref` MUST come from `buildBookingHref` (branded), not a string literal.
- **VALIDATE:** `corepack pnpm --filter @queuemed/web test` → pass.

## Testing Strategy
| Unit | Input | Expected | Phase |
|---|---|---|---|
| `parseCards` | `'{"cards":{"kind":"clinic_cards","items":[...]}}'` | the cards object | chat-api |
| `parseCards` | `'{"success":true}'` (no cards) | `undefined` | chat-api |
| `parseCards` | `"plain text"` | `undefined` | chat-api |
| `DiscoveryCardsView` | clinic_cards payload | renders N cards | web |
| card click | click a ClinicCard | `navigate(item.bookingHref)` called; `onNavigate` fired | web |
| DoctorCard slot | `nextAvailableSlot {kind:"day"}` | renders walk-in label, not a time | web |
Edge checklist: no cards (text only) · empty/undefined cards · mock mode (no chat-api) shows cards · MCP-down (text, no cards) · datetime vs day slot · long card lists scroll.

## Validation Commands
- chat-api: `corepack pnpm --filter @queuemed/chat-api typecheck|test|build`
- web: `corepack pnpm --filter @queuemed/web build` AND `cd apps/web && npx tsc --noEmit -p tsconfig.app.json` (vite build does NOT typecheck — lesson)
- web tests: `corepack pnpm --filter @queuemed/web test`
- Manual E2E: start chat-api + web; ask "find a clinic in Casablanca" → card renders → click → `/booking/:clinicId` opens prefilled.

## Acceptance Criteria
- [ ] chat-api returns `{ message, cards }`; `cards` populated when a discovery tool ran, else `undefined`.
- [ ] Model behavior unchanged (tool output still text to the model).
- [ ] Web renders `<ClinicCard/>`/`<DoctorCard/>` for the cards; tapping navigates to `bookingHref` (`/booking/:clinicId?staffId=`) and closes the chat.
- [ ] `DoctorCard` correctly distinguishes `datetime` vs `day` next-slot.
- [ ] Mock mode shows cards for clinic/doctor queries; MCP-down degrades to text.
- [ ] chat-api typecheck/test/build green; web build + `tsc --noEmit` (no NEW errors) + tests green.

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| AI SDK v5 `result.text` API name | L | M | It's a documented streamText result field; typecheck catches; fallback `for await textStream` accumulation |
| Switching chat-api to JSON breaks a streaming consumer | L | M | Only `ApiChatService` consumes `/api/chat`; updated in lockstep (Task 5) |
| `vite build` hides web type errors | M | M | Run `tsc --noEmit -p tsconfig.app.json` explicitly (lesson) |
| `nextAvailableSlot` union mis-rendered | M | M | Task 6 branches on `kind`; unit-tested |
| Cards from wrong tool (last-wins) misattributed | L | L | One discovery tool per turn in practice; last-wins is acceptable; documented |
| chat-api side-channel leaks across requests | L | M | `collectedCards` is a per-`createMcpSession` local (one per request) |

## Confidence: 7/10
The side-channel avoids fragile AI-SDK steps introspection and keeps model behavior identical (low-risk core). −3 for breadth (12 files across two apps), the `result.text` API assumption (typecheck-verified), and web card UI polish. Recommend implementing chat-api first (Tasks 1–3), verify the JSON envelope, then the web (4–9).

> Next: `/implement .claude\PRPs\plans\mcp-chat-card-rendering.plan.md`
