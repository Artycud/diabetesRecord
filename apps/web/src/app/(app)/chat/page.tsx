"use client";

import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { Bot, Send, Wind } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  role: "user" | "assistant";
  content: string;
  refusal?: boolean;
  toolStatus?: string;
}

const SUGGESTIONS = [
  "ค่า acetone ของฉันตอนนี้เป็นยังไงบ้าง?",
  "ฉันควรกินอะไรเพื่อเข้า ketosis ได้เร็วขึ้น?",
  "อธิบาย breath acetone กับ ketone ในเลือดต่างกันยังไง",
  "ทำไมค่าถึงขึ้นลงมาก วันนี้ผมกิน keto อยู่นะ",
];

export default function ChatPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<string | undefined>();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: devices } = useQuery({
    queryKey: ["devices"],
    queryFn: () => api.sensor.listDevices(),
  });

  const { data: promptsData } = useQuery({
    queryKey: ["ai-prompts"],
    queryFn: () => api.ai.listPrompts(),
    staleTime: 5 * 60 * 1000,
  });
  const prompts = promptsData?.prompts ?? [];

  const slashOpen = input.startsWith("/") && !input.includes(" ") && prompts.length > 0;
  const slashQuery = input.slice(1).toLowerCase();
  const filteredPrompts = slashOpen
    ? prompts.filter((p) =>
        (p.title ?? p.name).toLowerCase().includes(slashQuery) ||
        p.name.toLowerCase().includes(slashQuery)
      )
    : [];

  useEffect(() => {
    if (devices && devices.length > 0 && !selectedDevice) {
      const active = devices.find((d) => d.active);
      setSelectedDevice(active?.id ?? devices[0].id);
    }
  }, [devices, selectedDevice]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setInput("");

    const userMsg: Message = { role: "user", content: trimmed };
    setMessages((m) => [...m, userMsg, { role: "assistant", content: "" }]);
    setLoading(true);

    const patchAssistant = (patch: Partial<Message>) => {
      setMessages((m) => {
        const copy = [...m];
        const lastIdx = copy.length - 1;
        if (lastIdx >= 0 && copy[lastIdx].role === "assistant") {
          copy[lastIdx] = { ...copy[lastIdx], ...patch };
        }
        return copy;
      });
    };
    const appendAssistantText = (delta: string) => {
      setMessages((m) => {
        const copy = [...m];
        const lastIdx = copy.length - 1;
        if (lastIdx >= 0 && copy[lastIdx].role === "assistant") {
          copy[lastIdx] = { ...copy[lastIdx], content: copy[lastIdx].content + delta };
        }
        return copy;
      });
    };

    try {
      await api.ai.chatStream(trimmed, selectedDevice, (ev) => {
        if (ev.type === "text") {
          appendAssistantText(ev.delta);
        } else if (ev.type === "tool_use") {
          patchAssistant({ toolStatus: `กำลังดึงข้อมูล: ${ev.name}` });
        } else if (ev.type === "tool_result") {
          patchAssistant({ toolStatus: undefined });
        } else if (ev.type === "refusal") {
          patchAssistant({ content: ev.reply, refusal: true, toolStatus: undefined });
        } else if (ev.type === "error") {
          patchAssistant({ content: `เกิดข้อผิดพลาด: ${ev.message}`, toolStatus: undefined });
        }
      });
    } catch (e) {
      patchAssistant({ content: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง", toolStatus: undefined });
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-screen max-w-2xl mx-auto">
      {/* Header */}
      <div className="shrink-0 px-4 py-4 border-b border-border-soft bg-white flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-mint-50 border border-mint-100 flex items-center justify-center">
          <Bot size={18} className="text-mint-600" strokeWidth={1.5} />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-charcoal-500 text-sm">MetaBreath AI</p>
          <p className="text-[11px] text-muted">ที่ปรึกษาสุขภาพ metabolic</p>
        </div>
        {devices && devices.length > 0 && (
          <select
            value={selectedDevice ?? ""}
            onChange={(e) => setSelectedDevice(e.target.value || undefined)}
            className="text-xs border border-border-soft rounded-lg px-2 py-1.5 text-charcoal-500 bg-surface-2 focus:outline-none focus:ring-1 focus:ring-mint-400"
          >
            <option value="">ไม่มีอุปกรณ์</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.id.slice(0, 8)}… {d.active ? "●" : "○"}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
        {!hasMessages && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-mint-50 border border-mint-100 flex items-center justify-center">
              <Wind size={28} className="text-mint-500" strokeWidth={1.3} />
            </div>
            <div>
              <p className="font-semibold text-charcoal-500">ถามเรื่อง metabolic health ของคุณ</p>
              <p className="text-sm text-muted mt-1 max-w-xs">
                AI จะตอบโดยอิงข้อมูล breath acetone และ ketone ของคุณ
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 w-full max-w-sm">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-sm bg-white border border-border-soft rounded-xl px-4 py-3 text-charcoal-500 hover:border-mint-300 hover:bg-mint-50 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-lg bg-mint-100 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                <Bot size={14} className="text-mint-600" strokeWidth={1.5} />
              </div>
            )}
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              msg.role === "user"
                ? "bg-slate-900 text-white rounded-tr-sm"
                : msg.refusal
                ? "bg-amber-50 text-amber-800 border border-amber-200 rounded-tl-sm"
                : "bg-white border border-border-soft text-charcoal-500 rounded-tl-sm"
            }`}>
              {msg.role === "assistant" ? (
                <div>
                  {msg.toolStatus && (
                    <div className="text-[11px] text-mint-600 italic mb-1 flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-mint-500 animate-pulse" />
                      {msg.toolStatus}
                    </div>
                  )}
                  {msg.content ? (
                    <div className="prose prose-sm max-w-none [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_hr]:my-2 [&_hr]:border-border-soft [&_strong]:font-semibold [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-[12px] [&_a]:text-mint-600 [&_a]:underline">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    !msg.toolStatus && (
                      <div className="flex gap-1 py-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-mint-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-mint-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-mint-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    )
                  )}
                </div>
              ) : (
                msg.content.split("\n").map((line, j) => (
                  <span key={j}>
                    {line}
                    {j < msg.content.split("\n").length - 1 && <br />}
                  </span>
                ))
              )}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Disclaimer */}
      <div className="shrink-0 px-4 py-1.5 bg-amber-50 border-t border-amber-100">
        <p className="text-[10px] text-amber-700 text-center">
          AI ให้ข้อมูลเพื่อการศึกษาเท่านั้น ไม่ใช่คำแนะนำทางการแพทย์
        </p>
      </div>

      {/* Slash command menu */}
      {slashOpen && filteredPrompts.length > 0 && (
        <div className="shrink-0 px-4 pb-1 bg-white">
          <div className="border border-border-soft rounded-xl overflow-hidden bg-white shadow-sm">
            <div className="text-[10px] uppercase tracking-wide text-muted px-3 pt-2 pb-1">
              Slash commands
            </div>
            {filteredPrompts.slice(0, 6).map((p) => (
              <button
                key={p.name}
                onClick={() => {
                  setInput("");
                  send(p.text);
                }}
                className="w-full text-left px-3 py-2 hover:bg-mint-50 border-t border-border-soft/70"
              >
                <div className="text-sm font-medium text-charcoal-500">
                  /{p.name}{p.title && p.title !== p.name ? ` — ${p.title}` : ""}
                </div>
                {p.description && (
                  <div className="text-[11px] text-muted leading-snug mt-0.5">
                    {p.description}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 px-4 py-3 border-t border-border-soft bg-white">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="พิมพ์คำถาม... (Enter ส่ง, Shift+Enter ขึ้นบรรทัด)"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-border-soft px-4 py-2.5 text-sm text-charcoal-500 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-mint-300 transition max-h-32 overflow-y-auto"
            style={{ minHeight: "42px" }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = Math.min(t.scrollHeight, 128) + "px";
            }}
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
            className="h-10 w-10 shrink-0 rounded-xl bg-mint-500 hover:bg-mint-600 disabled:opacity-40 text-white flex items-center justify-center transition"
          >
            <Send size={16} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
