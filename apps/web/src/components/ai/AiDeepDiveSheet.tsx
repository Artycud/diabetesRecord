"use client";

import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { Sheet } from "@/components/ui/Sheet";

interface Props {
  question: string | null;
  deviceId: string | null | undefined;
  onClose: () => void;
}

/**
 * Deep-dive drawer opened from AiInterpretCard's in-card question chips —
 * the first real caller of api.ai.chat() (wired into the client already,
 * previously unused by any UI; the /chat page uses the separate streaming
 * chatStream variant instead). Reuses AiInterpretCard's own markdown +
 * loading/error treatment so the two AI surfaces feel like one system.
 */
export function AiDeepDiveSheet({ question, deviceId, onClose }: Props) {
  const { t } = useT();

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["ai", "chat", deviceId, question],
    queryFn: () => api.ai.chat(question!, deviceId ?? undefined),
    enabled: question != null,
  });

  return (
    <Sheet open={question != null} onOpenChange={(open) => !open && onClose()} title={question ?? ""}>
      {isLoading ? (
        <div className="space-y-1.5 animate-pulse py-1">
          <div className="h-3 w-full rounded bg-bg-raised" />
          <div className="h-3 w-4/5 rounded bg-bg-raised" />
          <div className="h-3 w-3/5 rounded bg-bg-raised" />
        </div>
      ) : isError || !data ? (
        <div className="py-1">
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
          <div className="text-sm text-text-primary leading-relaxed [&_p]:m-0 [&_strong]:font-semibold space-y-2">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.reply}</ReactMarkdown>
          </div>
          {!data.refusal && (
            <p className="text-[11px] text-text-disabled mt-3">{t("aiInterpret.disclaimer")}</p>
          )}
        </>
      )}
    </Sheet>
  );
}
