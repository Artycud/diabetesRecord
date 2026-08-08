"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, Send, X } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function FloatingAIButton() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { mutate: sendMessage, isPending } = useMutation({
    mutationFn: (msg: string) => api.ai.chat(msg),
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    },
    onError: () => {
      setMessages((prev) => [...prev, { role: "assistant", content: "เกิดข้อผิดพลาด กรุณาลองใหม่" }]);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isPending) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    sendMessage(text);
  };

  return (
    <>
      {/* FAB */}
      <button
        aria-label="AI Coach"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-50 h-14 w-14 rounded-full bg-mint-500 text-white flex items-center justify-center shadow-lg shadow-mint-500/30 hover:bg-mint-400 transition-colors print:hidden"
      >
        <Bot size={24} strokeWidth={1.6} />
      </button>

      {/* Bottom sheet */}
      {open && (
        <>
          <div className="fixed inset-0 z-50 bg-black/60 print:hidden" onClick={() => setOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-bg-elevated rounded-t-3xl max-h-[80vh] print:hidden">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-border-strong" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border-soft">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-mint-500/20 flex items-center justify-center">
                  <Bot size={16} className="text-mint-500" strokeWidth={1.6} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">AI Coach</p>
                  <p className="text-[10px] text-text-muted">MetaBreath Assistant</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="h-8 w-8 rounded-full bg-bg-raised flex items-center justify-center text-text-muted hover:text-text-primary"
              >
                <X size={16} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
              {messages.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-text-muted">สวัสดีครับ! มีอะไรให้ช่วยได้ไหมครับ</p>
                  <p className="text-xs text-text-disabled mt-1">เช่น "ค่า acetone ของฉันเป็นยังไง?"</p>
                </div>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={twMerge(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                    m.role === "user"
                      ? "ml-auto bg-mint-500 text-white rounded-br-sm"
                      : "bg-bg-raised text-text-primary rounded-bl-sm"
                  )}
                >
                  {m.content}
                </div>
              ))}
              {isPending && (
                <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-bg-raised px-4 py-2.5">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-2 w-2 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-2 w-2 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="px-4 py-3 border-t border-border-soft flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="พิมพ์ข้อความ..."
                className="flex-1 bg-bg-raised border border-border-soft rounded-full px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-mint-500 transition-colors"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isPending}
                className="h-10 w-10 rounded-full bg-mint-500 text-white flex items-center justify-center disabled:opacity-40 hover:bg-mint-400 transition-colors"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
