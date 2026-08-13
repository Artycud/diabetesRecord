"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { MessageCircle } from "lucide-react";

interface Props {
  question: string;
  deviceId?: string | null;
  className?: string;
  /** When present, renders as a button that calls this instead of
   *  navigating to /chat — used by AiInterpretCard's in-card chips, which
   *  open a deep-dive Sheet in place rather than leaving the page. */
  onSelect?: (question: string) => void;
}

/**
 * One contextual entry point into /chat, prefilled with a specific question —
 * this is what replaces the old floating chat bubble: AI reachable from the
 * moment a question would actually arise, not a permanent overlay.
 */
export function SuggestedQuestionChip({ question, deviceId, className, onSelect }: Props) {
  const pillClassName = `inline-flex items-center gap-1.5 rounded-full border border-mint-500/25 bg-mint-500/5 px-3 py-1.5 text-xs font-medium text-mint-500 hover:bg-mint-500/10 transition-colors ${className ?? ""}`;

  if (onSelect) {
    return (
      <motion.button
        type="button"
        onClick={() => onSelect(question)}
        whileTap={{ scale: 0.94 }}
        whileHover={{ scale: 1.02 }}
        transition={{ type: "spring", stiffness: 400, damping: 22 }}
        className={pillClassName}
      >
        <MessageCircle size={13} strokeWidth={1.8} />
        {question}
      </motion.button>
    );
  }

  const params = new URLSearchParams({ q: question });
  if (deviceId) params.set("device", deviceId);

  return (
    <Link href={`/chat?${params.toString()}`} className={pillClassName}>
      <MessageCircle size={13} strokeWidth={1.8} />
      {question}
    </Link>
  );
}
