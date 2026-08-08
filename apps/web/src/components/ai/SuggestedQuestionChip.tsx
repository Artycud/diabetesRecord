"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";

interface Props {
  question: string;
  deviceId?: string | null;
  className?: string;
}

/**
 * One contextual entry point into /chat, prefilled with a specific question —
 * this is what replaces the old floating chat bubble: AI reachable from the
 * moment a question would actually arise, not a permanent overlay.
 */
export function SuggestedQuestionChip({ question, deviceId, className }: Props) {
  const params = new URLSearchParams({ q: question });
  if (deviceId) params.set("device", deviceId);

  return (
    <Link
      href={`/chat?${params.toString()}`}
      className={`inline-flex items-center gap-1.5 rounded-full border border-mint-500/25 bg-mint-500/5 px-3 py-1.5 text-xs font-medium text-mint-500 hover:bg-mint-500/10 transition-colors ${className ?? ""}`}
    >
      <MessageCircle size={13} strokeWidth={1.8} />
      {question}
    </Link>
  );
}
