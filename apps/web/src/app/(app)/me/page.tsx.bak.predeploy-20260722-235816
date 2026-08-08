"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Palette, Globe, LogOut, ChevronRight, Ruler,
  Flame, Trophy, Star, Shield,
} from "lucide-react";
import { unitLabel, useUnits } from "@/lib/units";

const XP_PER_LEVEL = 100;

function StatSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-bg-elevated rounded-2xl p-3 text-center animate-pulse">
          <div className="h-4 w-4 rounded-full bg-bg-raised mx-auto mb-1" />
          <div className="h-7 bg-bg-raised rounded-lg mx-2 mb-1" />
          <div className="h-3 bg-bg-raised rounded w-10 mx-auto" />
        </div>
      ))}
    </div>
  );
}

export default function MePage() {
  const { user, logout } = useAuth();
  const { t, locale, setLocale } = useT();
  const router = useRouter();
  const { unit: acUnit } = useUnits();

  const { data: xp }     = useQuery({ queryKey: ["me", "xp"],     queryFn: api.gamification.getXP });
  const { data: streak } = useQuery({ queryKey: ["me", "streak"], queryFn: api.gamification.getStreak });
  const { data: badges } = useQuery({ queryKey: ["me", "badges"], queryFn: api.gamification.getBadges });

  const goalKey = user?.profile?.goal_type ?? "monitor";
  const pct = xp ? Math.round((xp.xp_in_level / XP_PER_LEVEL) * 100) : 0;
  const statsLoading = !xp || !streak || !badges;

  return (
    <div className="max-w-md mx-auto px-4 pt-5 pb-24 space-y-5">
      {/* Profile card */}
      <div className="bg-bg-elevated rounded-3xl p-5">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-2xl bg-mint-500/20 flex items-center justify-center text-2xl font-bold text-mint-500">
            {user?.profile?.display_name?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold text-text-primary truncate">
              {user?.profile?.display_name ?? user?.username}
            </p>
            <p className="text-sm text-text-muted">@{user?.username}</p>
            <p className="text-xs text-mint-500 mt-0.5">{t(`goal.${goalKey}` as never) || goalKey}</p>
          </div>
        </div>

        {/* XP bar */}
        {xp ? (
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span className="flex items-center gap-1"><Star size={11} className="text-gold-500" /> Lv.{xp.level} — {xp.level_name}</span>
              <span>{xp.xp_in_level}/{XP_PER_LEVEL} XP</span>
            </div>
            <div className="h-1.5 rounded-full bg-bg-raised overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-gold-300 to-gold-500 transition-all duration-700" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : (
          <div className="mt-4 animate-pulse space-y-1.5">
            <div className="h-3 bg-bg-raised rounded w-1/2" />
            <div className="h-1.5 bg-bg-raised rounded-full" />
          </div>
        )}
      </div>

      {/* Stats row */}
      {statsLoading ? <StatSkeleton /> : (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-bg-elevated rounded-2xl p-3 text-center">
            <div className="flex items-center justify-center mb-1">
              <Flame size={14} className="text-peach-500" />
            </div>
            <p className="text-2xl font-bold text-text-primary">{streak!.current}</p>
            <p className="text-xs text-text-muted mt-0.5 uppercase tracking-wider">Streak</p>
          </div>
          <div className="bg-bg-elevated rounded-2xl p-3 text-center">
            <div className="flex items-center justify-center mb-1">
              <Star size={14} className="text-gold-500" />
            </div>
            <p className="text-2xl font-bold text-text-primary">{xp!.total}</p>
            <p className="text-xs text-text-muted mt-0.5 uppercase tracking-wider">XP</p>
          </div>
          <div className="bg-bg-elevated rounded-2xl p-3 text-center">
            <div className="flex items-center justify-center mb-1">
              <Trophy size={14} className="text-gold-500" />
            </div>
            <p className="text-2xl font-bold text-text-primary">{badges!.length}</p>
            <p className="text-xs text-text-muted mt-0.5 uppercase tracking-wider">Badges</p>
          </div>
        </div>
      )}

      {/* Competition coming soon */}
      <div className="bg-bg-elevated rounded-2xl p-4 flex items-center gap-3 opacity-40">
        <div className="h-9 w-9 rounded-xl bg-gold-500/20 flex items-center justify-center">
          <Trophy size={16} className="text-gold-500" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-text-primary">Competition</p>
          <p className="text-xs text-text-muted">Coming soon</p>
        </div>
      </div>

      {/* Badges preview */}
      {badges && badges.length > 0 && (
        <div>
          <p className="text-xs text-text-muted font-semibold uppercase tracking-widest mb-3">Badges</p>
          <div className="grid grid-cols-4 gap-2">
            {badges.slice(0, 8).map((b) => (
              <div key={b.code} className="bg-bg-elevated rounded-xl p-2.5 text-center">
                <p className="text-2xl">{b.icon}</p>
                <p className="text-[10px] text-text-muted mt-1 leading-tight">{b.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Menu */}
      <div>
        <p className="text-xs text-text-muted font-semibold uppercase tracking-widest mb-3">Settings</p>
        <div className="bg-bg-elevated rounded-2xl overflow-hidden">
          {/* Admin Console — only for admin users */}
          {user?.is_admin && (
            <Link href="/admin" className="flex items-center gap-3 px-4 py-3.5 border-b border-border-soft hover:bg-bg-raised transition-colors">
              <div className="h-8 w-8 rounded-lg bg-gold-500/20 flex items-center justify-center">
                <Shield size={15} className="text-gold-500" />
              </div>
              <span className="flex-1 text-sm text-gold-500 font-medium text-left">Admin Console</span>
              <span className="text-[10px] text-gold-500 bg-gold-500/10 px-2 py-0.5 rounded-full">ADMIN</span>
              <ChevronRight size={14} className="text-text-disabled" />
            </Link>
          )}

          {/* Language toggle */}
          <button
            onClick={() => setLocale(locale === "th" ? "en" : "th")}
            className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-border-soft hover:bg-bg-raised transition-colors"
          >
            <div className="h-8 w-8 rounded-lg bg-bg-raised flex items-center justify-center">
              <Globe size={15} className="text-text-muted" />
            </div>
            <span className="flex-1 text-sm text-text-primary text-left">Language</span>
            <span className="text-xs text-text-muted font-mono bg-bg-raised px-2 py-0.5 rounded-full">
              {locale === "th" ? "ไทย" : "EN"}
            </span>
            <ChevronRight size={14} className="text-text-disabled" />
          </button>

          {/* Acetone units */}
          <Link href="/me/settings/units" className="flex items-center gap-3 px-4 py-3.5 border-b border-border-soft hover:bg-bg-raised transition-colors">
            <div className="h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Ruler size={15} className="text-blue-400" />
            </div>
            <span className="flex-1 text-sm text-text-primary font-medium">Acetone units</span>
            <span className="text-xs text-text-muted font-mono bg-bg-raised px-2 py-0.5 rounded-full">
              {unitLabel(acUnit)}
            </span>
            <ChevronRight size={14} className="text-text-disabled" />
          </Link>

          {/* Theme & appearance */}
          <Link href="/me/settings/appearance" className="flex items-center gap-3 px-4 py-3.5 hover:bg-bg-raised transition-colors">
            <div className="h-8 w-8 rounded-lg bg-mint-500/20 flex items-center justify-center">
              <Palette size={15} className="text-mint-500" />
            </div>
            <span className="flex-1 text-sm text-mint-500 font-medium">Theme & appearance</span>
            <ChevronRight size={14} className="text-text-disabled" />
          </Link>
        </div>
      </div>

      {/* Logout */}
      <button
        onClick={() => { logout(); router.replace("/login"); }}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-danger/30 text-danger text-sm font-semibold hover:bg-danger/10 transition-colors"
      >
        <LogOut size={16} />
        {t("auth.logout")}
      </button>
    </div>
  );
}
