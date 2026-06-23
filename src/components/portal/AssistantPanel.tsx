"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { askAssistant } from "@/server/assistant";

type ChatMessage = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Which of my leads are still drafts?",
  "Summarize what I'm looking at.",
  "Prep me for a call with one of my leads.",
];

export function AssistantPanel() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setError(null);
    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setPending(true);
    try {
      const res = await askAssistant({
        route: pathname,
        // Cap history sent to the server; the server re-validates and re-scopes data.
        messages: next.slice(-16),
      });
      if (res.ok && res.reply) {
        setMessages((m) => [...m, { role: "assistant", content: res.reply! }]);
      } else {
        setError(res.error || "Something went wrong.");
      }
    } catch {
      setError("Couldn't reach the assistant.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {/* Floating toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Open the AI assistant"
        className="fixed bottom-5 right-5 z-50 flex h-12 items-center gap-2 rounded-full bg-accent px-5 text-sm font-600 text-white shadow-card transition-colors hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
        {open ? "Close" : "Assistant"}
      </button>

      {/* Slide-out panel */}
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-navy-100 bg-white shadow-2xl transition-transform duration-200 ${
          open ? "translate-x-0" : "pointer-events-none translate-x-full"
        }`}
        role="dialog"
        aria-label="AI assistant"
        aria-hidden={!open}
      >
        <header className="flex items-center justify-between border-b border-navy-100 px-5 py-4">
          <div>
            <p className="font-heading text-lg font-700 text-navy">Assistant</p>
            <p className="text-xs text-navy-400">Sees only what you can — read &amp; advise only.</p>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button type="button" className="btn-ghost btn-sm" onClick={() => { setMessages([]); setError(null); }}>
                Clear
              </button>
            )}
            <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close">
              ✕
            </button>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-navy-600">
                Ask about your projects and leads, get call prep, draft a follow-up email,
                or get a hand with wording and pricing.
              </p>
              <div className="space-y-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="block w-full rounded-lg border border-navy-100 px-3 py-2 text-left text-sm text-navy-700 hover:border-navy-300 hover:bg-navy-50"
                    onClick={() => send(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === "user"
                    ? "bg-navy text-white"
                    : "border border-navy-100 bg-navy-50/60 text-navy-700"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {pending && (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-navy-100 bg-navy-50/60 px-4 py-2.5 text-sm text-navy-400">
                Thinking…
              </div>
            </div>
          )}

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>

        <form
          className="border-t border-navy-100 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={2}
              placeholder="Ask the assistant…"
              className="input flex-1 resize-none"
              disabled={pending}
            />
            <button type="submit" className="btn-primary btn-sm" disabled={pending || !input.trim()}>
              Send
            </button>
          </div>
          <p className="mt-1.5 text-center text-[11px] text-navy-400">
            Scoped to your role. Double-check anything before acting on it.
          </p>
        </form>
      </div>
    </>
  );
}
