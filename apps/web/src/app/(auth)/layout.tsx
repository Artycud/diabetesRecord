"use client";

import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace(
        user.profile?.onboarded_at ? "/home" : "/onboarding"
      );
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-mint-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center p-6"
      style={{
        backgroundImage: "url('/auth-bg.webp')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* Dark scrim over background image */}
      <div className="absolute inset-0 bg-slate-950/52" />

      <div className="relative z-10 w-full max-w-sm">
        {/* Brand section */}
        <div className="mb-10 flex flex-col items-center text-center select-none">
          {/* App name: META solid + Breath wind-fade */}
          <div className="flex items-baseline gap-2">
            <span className="text-[3rem] font-black uppercase tracking-tight text-white leading-none">
              Meta
            </span>
            <span
              className="font-display text-[3rem] font-bold tracking-[0.12em] leading-none uppercase text-mint-500"
            >
              Breath
            </span>
          </div>

          <p className="mt-3 text-[10px] font-medium tracking-[0.28em] uppercase text-white/38">
            Metabolic Intelligence
          </p>
        </div>

        {/* Login / Register card — strong elevation shadow */}
        <div className="overflow-hidden rounded-3xl shadow-[0_28px_64px_-12px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.06)]">
          {children}
        </div>
      </div>
    </div>
  );
}
