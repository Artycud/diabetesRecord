"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { twMerge } from "tailwind-merge";
import { Sparkles, RotateCcw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { BentoTile } from "@/components/ui/BentoTile";
import { NoDeviceNotice } from "@/components/ui/NoDeviceNotice";
import { SuggestedQuestionChip } from "@/components/ai/SuggestedQuestionChip";
import { AiDeepDiveSheet } from "@/components/ai/AiDeepDiveSheet";

/**
 * AiInterpretCard — short 1-3 sentence AI interpretation of a reading
 * (POST /ai/interpret), compared against the user's personal baseline
 * server-side. Used right after a breath session completes (Task D2).
 *
 * `refusal: true` is an expected guardrail outcome, not an error — its
 * `text` is already a safe, ready-to-show message, so it's rendered with
 * the same styling as a normal interpretation rather than an error state.
 *
 * Three distinct states, not one generic error: loading (spinner-ish
 * skeleton), "not enough data yet" (skips the API call entirely — the
 * caller already knows there's nothing to interpret), and a real fetch
 * failure (network/HTTP error — the only case that shows the generic
 * "unavailable" copy, now with a retry action). Resilience against a
 * failed/quota-exhausted primary AI backend is handled entirely server-side
 * (app/services/ai_fallback.py, admin-configured global OpenAI/Gemini key)
 * — this component always just calls /ai/interpret and gets a normal
 * response either way.
 */
interface Props {
  deviceId: string | null | undefined;
  /** Bump this (e.g. a timestamp/counter) to force a fresh interpretation
   *  after a new session is saved, since the query would otherwise just
   *  serve the cached result for this deviceId. */
  refreshKey?: number | string;
  time?: string;
  className?: string;
  /** When explicitly false, skips the API call and shows a "no reading
   *  yet" empty state instead — omit (or true) to keep always calling. */
  hasReadingToday?: boolean;
  /** 2-3 contextual questions rendered as in-card chips; tapping one opens
   *  a deep-dive Sheet (api.ai.chat) instead of leaving the page. */
  questions?: string[];
  /** When set, this card is a doctor viewing an assigned patient's reading
   *  (not their own) — calls the doctor-scoped interpret endpoint instead
   *  of the self-scoped one. Chat entry points are hidden in this mode:
   *  /ai/chat is transport-scoped to the caller's own account context
   *  (mcp_scope(user.id, ...)), so there's no way to point it at a
   *  different patient — leaving it visible would silently answer using
   *  the doctor's own (likely empty) data instead of the patient's. */
  patientId?: string;
}

export function AiInterpretCard({ deviceId, refreshKey, time, className, hasReadingToday, questions, patientId }: Props) {
  const { t } = useT();
  const noReadingYet = hasReadingToday === false;
  const [sheetQuestion, setSheetQuestion] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["ai", "interpret", patientId ?? "self", deviceId, time ?? "latest", refreshKey ?? 0],
    queryFn: () =>
      patientId
        ? api.doctor.interpretPatientReading(patientId, deviceId!, time)
        : api.ai.interpret(deviceId!, time),
    enabled: !!deviceId && !noReadingYet,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const noDevice = !deviceId;

  return (
    // Joins the same frosted-glass family as the bento grid / Details tiles
    // rather than a flat mint-tinted card — the solid icon badge below is
    // what actually carries "this is AI-generated" at a glance.
    <>
    <BentoTile className={twMerge("flex-row gap-3", className)}>
        <div className="h-9 w-9 rounded-xl bg-mint-500 flex items-center justify-center shrink-0">
          <Sparkles size={16} className="text-white" strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-text-muted">
            {t("aiInterpret.title")}
          </p>
          {noDevice ? (
            <NoDeviceNotice description={t("aiInterpret.noDeviceHint")} className="mt-1.5" />
          ) : noReadingYet ? (
            // No CTA here on purpose — the primary "start a check" action
            // already lives on the hero above; a second button here would
            // just duplicate it (see the Home CTA audit).
            <div className="mt-1">
              <p className="text-sm text-text-muted">{t("aiInterpret.noReading")}</p>
              <p className="text-xs text-text-disabled mt-0.5">{t("aiInterpret.noReadingHint")}</p>
            </div>
          ) : isLoading ? (
            <div className="mt-2 space-y-1.5 animate-pulse">
              <div className="h-3 w-full rounded bg-bg-raised" />
              <div className="h-3 w-4/5 rounded bg-bg-raised" />
            </div>
          ) : isError || !data ? (
            <div className="mt-1">
              <p className="text-sm text-text-muted">{t("aiInterpret.error")}</p>
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isRefetching}
                className="flex items-center gap-1 text-xs text-mint-500 font-medium mt-1.5 disabled:opacity-50"
              >
                <RotateCcw size={11} className={isRefetching ? "animate-spin" : ""} />
                {t("aiInterpret.retry")}
              </button>
            </div>
          ) : (
            <>
              <div className="text-sm text-text-primary mt-1 leading-relaxed [&_p]:m-0 [&_strong]:font-semibold">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.text}</ReactMarkdown>
              </div>
              {!data.refusal && (
                <p className="text-[11px] text-text-disabled mt-2">{t("aiInterpret.disclaimer")}</p>
              )}
              {!patientId && questions && questions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {questions.map((q) => (
                    <SuggestedQuestionChip key={q} question={q} onSelect={setSheetQuestion} />
                  ))}
                </div>
              )}
              {!patientId && (
                <Link
                  href={deviceId ? `/chat?device=${deviceId}` : "/chat"}
                  className="inline-flex items-center rounded-full bg-bg-surface border border-border-soft px-3 py-1 text-xs font-medium text-mint-600 mt-2 hover:border-mint-500/40 transition-colors"
                >
                  {t("aiInterpret.askMore")}
                </Link>
              )}
            </>
          )}
        </div>
    </BentoTile>
    {!patientId && (
      <AiDeepDiveSheet question={sheetQuestion} deviceId={deviceId} onClose={() => setSheetQuestion(null)} />
    )}
    </>
  );
}
