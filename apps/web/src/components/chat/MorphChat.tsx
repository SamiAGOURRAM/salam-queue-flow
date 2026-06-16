/**
 * MorphChat — "Ask AI" dock that morphs from a pill into a full conversational
 * panel. Ported from the Digital_portfolio MorphPanel aesthetic, but wired to
 * QueueMed's own JWT-authenticated chat-api (via ApiChatService streaming) and
 * react-i18next.
 */
import React from "react";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { X, ArrowUp, Square, SquarePen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { createChatService } from "@/services/chat";
import type { ApiChatService } from "@/services/chat/ApiChatService";
import { cn } from "@/lib/utils";
import { DiscoveryCardsView } from "./DiscoveryCardsView";
import type { DiscoveryCards } from "@queuemed/core";

const ORB_BASE = "oklch(22.64% 0 0)";

/* ── ColorOrb ──────────────────────────────────────────────────────────── */
interface OrbProps {
  dimension?: string;
  className?: string;
  tones?: { base?: string; accent1?: string; accent2?: string; accent3?: string };
  spinDuration?: number;
}

export const ColorOrb: React.FC<OrbProps> = ({ dimension = "192px", className, tones, spinDuration = 20 }) => {
  const fallbackTones = {
    base: "oklch(95% 0.02 264.695)",
    accent1: "oklch(75% 0.15 350)",
    accent2: "oklch(80% 0.12 200)",
    accent3: "oklch(78% 0.14 280)",
  };
  const palette = { ...fallbackTones, ...tones };
  const dimValue = parseInt(dimension.replace("px", ""), 10);
  const blurStrength = dimValue < 50 ? Math.max(dimValue * 0.008, 1) : Math.max(dimValue * 0.015, 4);
  const contrastStrength = dimValue < 50 ? Math.max(dimValue * 0.004, 1.2) : Math.max(dimValue * 0.008, 1.5);
  const pixelDot = dimValue < 50 ? Math.max(dimValue * 0.004, 0.05) : Math.max(dimValue * 0.008, 0.1);
  const shadowRange = dimValue < 50 ? Math.max(dimValue * 0.004, 0.5) : Math.max(dimValue * 0.008, 2);
  const maskRadius = dimValue < 30 ? "0%" : dimValue < 50 ? "5%" : dimValue < 100 ? "15%" : "25%";
  const adjustedContrast = dimValue < 30 ? 1.1 : dimValue < 50 ? Math.max(contrastStrength * 1.2, 1.3) : contrastStrength;

  return (
    <div
      className={cn("color-orb", className)}
      style={{
        width: dimension,
        height: dimension,
        "--base": palette.base,
        "--accent1": palette.accent1,
        "--accent2": palette.accent2,
        "--accent3": palette.accent3,
        "--spin-duration": `${spinDuration}s`,
        "--blur": `${blurStrength}px`,
        "--contrast": adjustedContrast,
        "--dot": `${pixelDot}px`,
        "--shadow": `${shadowRange}px`,
        "--mask": maskRadius,
      } as React.CSSProperties}
    />
  );
};

/* ── Chat ──────────────────────────────────────────────────────────────── */
interface Msg {
  id: string;
  role: "user" | "assistant";
  text: string;
  cards?: DiscoveryCards;
}

const SPRING = { type: "spring" as const, stiffness: 520, damping: 44, mass: 0.7 };

function DockPill({ onOpen, label }: { onOpen: () => void; label: string }) {
  return (
    <button type="button" onClick={onOpen} className="absolute inset-0 flex items-center justify-center gap-2 px-3">
      <ColorOrb dimension="22px" tones={{ base: ORB_BASE }} />
      <span className="truncate text-sm font-medium text-white/85">{label}</span>
    </button>
  );
}

export function MorphChat() {
  const { t } = useTranslation();
  const service = React.useRef(createChatService()).current;

  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const threadRef = React.useRef<HTMLDivElement>(null);
  const shakeControls = useAnimationControls();

  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const hasMessages = messages.length > 0;
  const last = messages[messages.length - 1];
  const lastEmptyAssistant = last?.role === "assistant" && last.text.trim() === "";
  const showThinking = busy && (!last || last.role === "user" || lastEmptyAssistant);

  const suggestions: string[] = [
    t("chat.suggest1", "Find a clinic in Casablanca"),
    t("chat.suggest2", "How does the queue work?"),
    t("chat.suggest3", "Help me book an appointment"),
  ];

  const triggerOpen = () => {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 60);
  };
  const triggerClose = () => {
    setOpen(false);
    inputRef.current?.blur();
  };

  const submit = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setInput("");
    setError(null);
    const userId = `u-${Date.now()}`;
    const aId = `a-${Date.now()}`;
    setMessages((prev) => [...prev, { id: userId, role: "user", text }, { id: aId, role: "assistant", text: "" }]);
    setBusy(true);
    try {
      const stream = (service as ApiChatService).sendMessageStream;
      if (typeof stream === "function") {
        // Stream the text as it resolves, then attach any discovery cards from
        // the final response envelope.
        const res = await stream.call(service, text, (_chunk: string, full: string) => {
          setMessages((prev) => prev.map((m) => (m.id === aId ? { ...m, text: full } : m)));
        });
        setMessages((prev) => prev.map((m) => (m.id === aId ? { ...m, text: res.message, cards: res.cards } : m)));
      } else {
        const res = await service.sendMessage(text);
        setMessages((prev) => prev.map((m) => (m.id === aId ? { ...m, text: res.message, cards: res.cards } : m)));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setMessages((prev) => prev.filter((m) => m.id !== aId));
    } finally {
      setBusy(false);
    }
  };

  const clearConversation = async () => {
    setMessages([]);
    setInput("");
    setError(null);
    await service.clearHistory();
    setTimeout(() => inputRef.current?.focus(), 40);
  };

  // Close on outside click / Escape.
  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) triggerClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && triggerClose();
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Gentle attention shake until first use.
  React.useEffect(() => {
    if (open || hasMessages) return;
    let count = 0;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const delayFor = (n: number) => (n < 4 ? 8000 : n < 8 ? 45000 : 180000);
    const loop = () => {
      timer = setTimeout(async () => {
        if (cancelled) return;
        await shakeControls.start({
          rotate: [0, -8, 6, -4, 2, 0],
          x: [0, -4, 4, -2, 1, 0],
          transition: { duration: 0.6, ease: "easeInOut" },
        });
        count += 1;
        loop();
      }, delayFor(count));
    };
    loop();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, hasMessages, shakeControls]);

  // Autoscroll.
  React.useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, showThinking]);

  const size = !open
    ? { width: 132, height: 44, borderRadius: 22 }
    : hasMessages
      ? { width: 384, height: 540, borderRadius: 20 }
      : { width: 384, height: 320, borderRadius: 20 };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(input);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end justify-end">
      <motion.div animate={shakeControls} style={{ transformOrigin: "bottom right" }}>
        <motion.div
          ref={wrapperRef}
          initial={false}
          animate={size}
          transition={{ ...SPRING, delay: open ? 0 : 0.05 }}
          className="relative overflow-hidden border border-white/10 bg-neutral-900 text-white shadow-2xl"
        >
          {/* Collapsed pill */}
          <AnimatePresence>
            {!open && (
              <motion.div key="dock" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="absolute inset-0">
                <DockPill onOpen={triggerOpen} label={t("chat.dock", "Ask AI")} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Open panel */}
          <AnimatePresence>
            {open && (
              <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, delay: 0.05 }} className="absolute inset-0 flex flex-col" style={{ width: 384 }}>
                {/* Header */}
                <header className="flex shrink-0 items-center gap-2.5 border-b border-white/10 px-3.5 py-3">
                  <ColorOrb dimension="22px" tones={{ base: ORB_BASE }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight text-white">{t("chat.title", "QueueMed Assistant")}</p>
                    <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/40">{t("chat.subtitle", "AI · clinics · queue · booking")}</p>
                  </div>
                  {hasMessages && (
                    <button type="button" onClick={clearConversation} aria-label={t("chat.newChat", "New chat")} title={t("chat.newChat", "New chat")} className="flex h-7 w-7 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white">
                      <SquarePen className="h-4 w-4" />
                    </button>
                  )}
                  <button type="button" onClick={triggerClose} aria-label={t("chat.close", "Close")} className="flex h-7 w-7 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white">
                    <X className="h-4 w-4" />
                  </button>
                </header>

                {/* Thread */}
                <div ref={threadRef} className="flex-1 space-y-4 overflow-y-auto px-3.5 py-4">
                  {!hasMessages && !showThinking && (
                    <div className="flex h-full flex-col items-center justify-center gap-6 px-2 py-4 text-center">
                      <ColorOrb dimension="52px" tones={{ base: ORB_BASE }} />
                      <p className="max-w-[17rem] text-xl font-semibold leading-snug text-white">{t("chat.greeting", "Hi! How can I help with clinics, appointments or your queue?")}</p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {suggestions.map((s) => (
                          <button key={s} type="button" onClick={() => submit(s)} className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-white/35 hover:text-white">
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {messages.map((m) => {
                    if (m.role === "assistant" && m.text.trim() === "") return null;
                    return m.role === "user" ? (
                      <div key={m.id} className="flex justify-end">
                        <div className="max-w-[82%] rounded-2xl rounded-br-md bg-white/10 px-3.5 py-2 text-sm leading-relaxed text-white">{m.text}</div>
                      </div>
                    ) : (
                      <div key={m.id} className="flex items-start gap-2.5">
                        <ColorOrb dimension="20px" tones={{ base: ORB_BASE }} className="mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="whitespace-pre-wrap text-sm leading-[1.6rem] text-white/90">{m.text}</p>
                          {m.cards && <DiscoveryCardsView cards={m.cards} onNavigate={triggerClose} />}
                        </div>
                      </div>
                    );
                  })}

                  {showThinking && (
                    <div className="flex items-center gap-2.5">
                      <ColorOrb dimension="20px" tones={{ base: ORB_BASE }} className="shrink-0" />
                      <div className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <motion.span key={i} className="h-1.5 w-1.5 rounded-full bg-white/50" animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }} />
                        ))}
                      </div>
                    </div>
                  )}

                  {error && !busy && (
                    <div className="flex items-start gap-2.5">
                      <ColorOrb dimension="20px" tones={{ base: ORB_BASE }} className="mt-0.5 shrink-0" />
                      <p className="text-sm leading-[1.6rem] text-rose-300">{error}</p>
                    </div>
                  )}
                </div>

                {/* Composer */}
                <form onSubmit={(e) => { e.preventDefault(); submit(input); }} className="shrink-0 px-3 pb-3 pt-1">
                  <div className="flex items-end gap-2 rounded-2xl border border-white/12 bg-white/[0.04] px-3 py-2 transition-colors focus-within:border-white/25">
                    <textarea
                      ref={inputRef}
                      rows={1}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={onKeyDown}
                      placeholder={t("chat.placeholder", "Ask anything…")}
                      spellCheck={false}
                      style={{ outline: "none", boxShadow: "none" }}
                      className="max-h-24 flex-1 resize-none bg-transparent py-1 text-sm text-white placeholder:text-white/40"
                    />
                    {busy ? (
                      <button type="button" onClick={() => setBusy(false)} aria-label={t("chat.stop", "Stop")} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-neutral-900 transition-all duration-200 hover:scale-105">
                        <Square className="h-3.5 w-3.5 fill-current" />
                      </button>
                    ) : (
                      <button type="submit" disabled={!input.trim()} aria-label={t("chat.send", "Send")} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-neutral-900 transition-all duration-200 enabled:hover:scale-105 disabled:opacity-40">
                        <ArrowUp className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <p className="mt-1.5 px-1 text-center font-mono text-[9px] uppercase tracking-[0.16em] text-white/30">{t("chat.note", "AI can make mistakes · verify important info")}</p>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </div>
  );
}

export default MorphChat;
