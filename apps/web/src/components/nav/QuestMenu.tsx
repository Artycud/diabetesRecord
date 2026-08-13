"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Star, Check } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { api } from "@/lib/api";

const XP_PER_LEVEL = 100;

/**
 * Replaces the header's old "+" quick-actions menu. Gamification (streak,
 * XP, quests) was scattered across Home's header, a mid-page quest card,
 * and Profile — this consolidates quests+XP into one place next to the
 * streak, as a dropdown rather than a permanent card, so relocating them
 * here doesn't add a new layout region to a page that's already had two
 * reverted redesigns over layout regressions.
 */
export function QuestMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: xp } = useQuery({ queryKey: ["me", "xp"], queryFn: api.gamification.getXP });
  const { data: quests, isLoading: questsLoading } = useQuery({
    queryKey: ["me", "quests"],
    queryFn: api.gamification.getQuestsToday,
  });

  const pendingCount = (quests ?? []).filter((q) => !q.completed_at).length;
  const pct = xp ? Math.round((xp.xp_in_level / XP_PER_LEVEL) * 100) : 0;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        aria-label="Quests & XP"
        onClick={() => setOpen((v) => !v)}
        className={twMerge(
          "relative h-9 w-9 rounded-full flex items-center justify-center transition-all duration-200",
          open ? "bg-gold-500/15 text-gold-500" : "bg-bg-elevated text-text-muted hover:text-text-primary"
        )}
      >
        <Trophy size={16} strokeWidth={1.8} />
        {pendingCount > 0 && (
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-peach-500" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-72 sm:w-80 bg-bg-elevated border border-border-soft rounded-2xl p-3 shadow-xl z-50 animate-fade-rise-in">
          {xp && (
            <div className="px-1 pb-3 mb-2 border-b border-border-soft space-y-1.5">
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span className="flex items-center gap-1">
                  <Star size={11} className="text-gold-500" /> Lv.{xp.level} — {xp.level_name}
                </span>
                <span>{xp.xp_in_level}/{XP_PER_LEVEL} XP</span>
              </div>
              <div className="h-1.5 rounded-full bg-bg-raised overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-gold-300 to-gold-500 transition-all duration-700"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          <p className="text-xs text-text-muted font-semibold uppercase tracking-widest px-1 mb-2">
            Quest วันนี้
          </p>

          {questsLoading ? (
            <div className="space-y-2.5 px-1 animate-pulse">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-8 bg-bg-raised rounded-lg" />
              ))}
            </div>
          ) : !quests || quests.length === 0 ? (
            <p className="text-sm text-text-muted px-1 py-2">ยังไม่มี quest วันนี้</p>
          ) : (
            <div className="space-y-3 max-h-72 overflow-y-auto px-1">
              {quests.map((q) => (
                <div key={q.id} className={`flex items-center gap-3 ${!q.completed_at ? "" : "opacity-60"}`}>
                  <div
                    className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                      q.completed_at ? "bg-mint-500" : "border-2 border-border-strong"
                    }`}
                  >
                    {q.completed_at && <Check size={10} className="text-white" strokeWidth={3} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${q.completed_at ? "text-text-muted line-through" : "text-text-primary"}`}>
                      {q.title}
                    </p>
                    <p className="text-xs text-text-disabled truncate">{q.description}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-gold-500 font-semibold">+{q.xp_reward} XP</p>
                    <p className="text-[10px] text-text-disabled font-mono">{q.progress}/{q.target}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
