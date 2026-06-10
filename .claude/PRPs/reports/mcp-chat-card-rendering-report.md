# Implementation Report: Chat renders clickable discovery cards (Phase 4)

## Summary
The chat now displays clickable doctor/clinic cards that deep-link into `BookingFlow`.
Per the locked decision, we **extended the existing custom chat contract** (kept
`IChatService` + `ChatWindow` + `MockChatService`) rather than adopting
`@ai-sdk/react useChat`: chat-api side-channels the discovery tool's `cards` and
returns a JSON envelope `{ message, cards }`; the web parses it and renders new
`<ClinicCard/>`/`<DoctorCard/>` whose click navigates to the code-minted `bookingHref`.

This closes the loop the user first hit ("I get text, no card") — the cause was
`mcp.ts` flattening tool output to a string + `agent.ts` streaming plain text.

## Assessment vs Reality
| Metric | Predicted | Actual |
|---|---|---|
| Complexity | Large (~12 files) | Large — 14 files (added MorphChat back-compat + DoctorDirectory test fix) |
| Confidence | 7/10 | Held; `result.text` worked; the side-channel avoided AI-SDK steps introspection as planned |

## Tasks Completed
| # | Task | Status |
|---|---|---|
| 1 | mcp.ts side-channel `cards` (+ `parseCards`, `getCollectedCards`) | ✅ |
| 2 | agent.ts returns `{ message, cards }` JSON (mock + LLM + error paths) | ✅ |
| 3 | chat-api vitest runner + `parseCards` test + tsconfig exclude | ✅ |
| 4 | web `ChatService` gains `cards?: DiscoveryCards` | ✅ |
| 5 | `ApiChatService` parses JSON envelope | ✅ |
| 6 | `ClinicCard` / `DoctorCard` / `DiscoveryCardsView` | ✅ |
| 7 | `MessageBubble` renders cards (shared type) | ✅ |
| 8 | `ChatWindow` attaches cards + close-on-navigate | ✅ |
| 9 | `MockChatService` demo cards + `cards.test.tsx` | ✅ |

## Validation Results
| Level | Status | Notes |
|---|---|---|
| chat-api typecheck | ✅ 0 | |
| chat-api tests | ✅ 4/4 | `parseCards` |
| chat-api build | ✅ | clean, no test-file leak |
| web tsc (`-p tsconfig.app.json`) | ✅ 0 NEW | 11 pre-existing foreign errors only; all chat files clean (ran tsc explicitly — `vite build` doesn't typecheck) |
| web build | ✅ | `vite build` 14.4s |
| web tests | ✅ 198/198 (30 files) | incl. new `cards.test.tsx` (2) |

## Files Changed
| File | Action |
|---|---|
| `apps/chat-api/src/mcp.ts` | UPDATE — `parseCards`, per-session `collectedCards`, `getCollectedCards()` |
| `apps/chat-api/src/agent.ts` | UPDATE — `res.json({message,cards})` (mock/LLM/error); dropped text/plain streaming |
| `apps/chat-api/src/mcp.test.ts` | CREATE — `parseCards` (4 tests) |
| `apps/chat-api/package.json` | UPDATE — `vitest` devDep + `test` script |
| `apps/chat-api/tsconfig.json` | UPDATE — exclude `**/*.test.ts` |
| `apps/web/src/services/chat/ChatService.ts` | UPDATE — `cards?` on `ChatMessage`+`ChatResponse` |
| `apps/web/src/services/chat/ApiChatService.ts` | UPDATE — parse JSON envelope; `sendMessageStream` back-compat wrapper |
| `apps/web/src/services/chat/MockChatService.ts` | UPDATE — demo cards (via `buildBookingHref`) |
| `apps/web/src/components/chat/ClinicCard.tsx` | CREATE |
| `apps/web/src/components/chat/DoctorCard.tsx` | CREATE — branches `nextAvailableSlot` union (datetime vs day) |
| `apps/web/src/components/chat/DiscoveryCardsView.tsx` | CREATE |
| `apps/web/src/components/chat/MessageBubble.tsx` | UPDATE — renders cards; shared `ChatMessage` type |
| `apps/web/src/components/chat/ChatWindow.tsx` | UPDATE — attaches `cards`; `onCardNavigate={onClose}` |
| `apps/web/src/components/chat/cards.test.tsx` | CREATE — render + navigate (2 tests) |
| `apps/web/src/components/booking/DoctorDirectory.test.tsx` | UPDATE — fixture fixed for role-based filter (see deviations) |

## Deviations from Plan (WHAT / WHY)
1. **Restored `ApiChatService.sendMessageStream` as a back-compat wrapper.** The plan removed it, but `MorphChat.tsx:125` references it. chat-api is now request/response, so the wrapper resolves the full reply and fires `onDelta` once. Keeps `MorphChat` compiling/working without re-introducing real streaming.
2. **Fixed `DoctorDirectory.test.tsx`** — NOT in this plan; it broke because the *hardening batch's* role-based `isDoctorLikeRole` tightening (specialization no longer qualifies) was validated via build+tsc, not `vitest`, so the stale fixture (`role:"staff"+specialization` expected included) only surfaced when I ran the full web suite here. Updated the fixture to assert the new behavior (allowlist `dentist` included; `nurse`+specialization excluded). **Lesson reinforced:** run the package's `vitest`, not just `vite build`, after a behavior change.
3. **`agent.ts` dropped the `text/plain` content-type** and the `textStream` write loop in favor of `await result.text` + `res.json`. Mock path also returns JSON now.

## Issues Encountered & Resolutions
- **`MorphChat` broke** on the removed `sendMessageStream` → restored as a wrapper (deviation #1).
- **`DoctorDirectory.test` failed** on the full suite → stale role fixture from the prior batch → fixed (deviation #2).
- **`vite build` green but types unverified** → ran `tsc --noEmit -p tsconfig.app.json` explicitly (lesson) → 0 new errors.

## Tests Written
| File | Tests | Coverage |
|---|---|---|
| `apps/chat-api/src/mcp.test.ts` | 4 | `parseCards`: cards present · no cards · null/undefined · non-JSON |
| `apps/web/src/components/chat/cards.test.tsx` | 2 | clinic card renders + click→`navigate(bookingHref)` + `onNavigate`; doctor card walk-in (day) slot label + `?staffId=` href |

## Architecture / Security Notes
- **Model behavior unchanged** — `mcp.ts` execute still returns text to the model; `cards` are side-channeled onto the per-request session (no cross-request bleed; one `createMcpSession` per request).
- **bookingHref stays branded/code-minted** — cards navigate to `item.bookingHref` directly; the mock uses `buildBookingHref`, never a literal.
- **`DoctorCard` honors the `NextAvailableSlot` discriminated union** — renders a time for `datetime`, "Walk-in: <date>" for `day` (the type-design win from the last review preventing a `new Date(day)` bug).

## Acceptance Criteria
- [x] chat-api returns `{ message, cards }`; `cards` populated when a discovery tool ran, else `undefined`.
- [x] Model behavior unchanged (tool output still text to the model).
- [x] Web renders `<ClinicCard/>`/`<DoctorCard/>`; tap navigates to `bookingHref` and closes the chat.
- [x] `DoctorCard` distinguishes `datetime` vs `day` next-slot.
- [x] Mock mode shows cards for clinic/doctor queries; MCP-down degrades to text.
- [x] chat-api typecheck/test/build green; web build + `tsc --noEmit` (no NEW errors) + tests green.

## Next Steps
- [ ] Manual E2E: start chat-api + web; "find a clinic in Casablanca" → card → tap → `/booking/:clinicId` prefilled. (Demo mode already shows cards without a backend.)
- [ ] `/code-review` (optional).
- [ ] Phase 5 (auth eval suite: capability + cross-role denial) — the last PRD phase.
- [ ] Commit — large uncommitted surface (this + hardening batch + NodeNext/Phase-3); coordinate the foreign-WIP files.
