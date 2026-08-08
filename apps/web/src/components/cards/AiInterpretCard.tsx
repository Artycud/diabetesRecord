"use client";

import { useQuery } from "@tanstack/react-query";
import { twMerge } from "tailwind-merge";
import { Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";

/**
 * AiInterpretCard — short 1-3 sentence AI interpretation of a reading
 * (POST /ai/interpret), compared against the user's personal baseline
 * server-side. Used right after a breath session completes (Task D2).
 *
 * `refusal: true` is an expected guardrail outcome, not an error — its
 * `text` is already a safe, ready-to-show message, so it's rendered with
 * the same styling as a normal interpretation rather than an error state.
 */
interface Props {
  deviceId: string | null | undefined;
  /** Bump this (e.g. a timestamp/counter) to force a fresh interpretation
   *  after a new session is saved, since the query would otherwise just
   *  serve the cached result for this deviceId. */
  refreshKey?: number | string;
  time?: string;
  className?: string;
}

export function AiInterpretCard({ deviceId, refreshKey, time, className }: Props) {
  const { t } = useT();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["ai", "interpret", deviceId, time ?? "latest", refreshKey ?? 0],
    queryFn: () => api.ai.interpret(deviceId!, time),
    enabled: !!deviceId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (!deviceId) return null;

  return (
    <Card className={twMerge("border border-mint-500/15", className)}>
      <CardContent className="flex gap-3">
        <div className="h-9 w-9 rounded-xl bg-mint-500/10 flex items-center justify-center shrink-0">
          <Sparkles size={16} className="text-mint-500" strokeWidth={1.6} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-text-muted">
            {t("aiInterpret.title")}
          </p>
          {isLoading ? (
            <div className="mt-2 space-y-1.5 animate-pulse">
              <div className="h-3 w-full rounded bg-bg-raised" />
              <div className="h-3 w-4/5 rounded bg-bg-raised" />
            </div>
          ) : isError || !data ? (
            <p className="text-sm text-text-muted mt-1">{t("aiInterpret.error")}</p>
          ) : (
            <>
              <p className="text-sm text-text-primary mt-1 leading-relaxed">{data.text}</p>
              {!data.refusal && (
                <p className="text-[11px] text-text-disabled mt-2">{t("aiInterpret.disclaimer")}</p>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
