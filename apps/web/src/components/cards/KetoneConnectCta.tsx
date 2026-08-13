"use client";

import Link from "next/link";
import { FlaskConical, Plus } from "lucide-react";
import { useT } from "@/lib/i18n";

interface Props {
  href: string;
}

/** Minimal, high-end empty-state for the (manual, lab-only) ketone section —
 *  deliberately not a gray broken-chart placeholder. Blood/urine ketone
 *  values always require a manual entry (see /log's KetoneForm), so an empty
 *  chart here is the expected default state, not an error — this reads as an
 *  intentional entry point instead. Icon-well + text pattern mirrors
 *  NoDeviceNotice; the pill trigger mirrors AiInterpretCard's "askMore" link. */
export function KetoneConnectCta({ href }: Props) {
  const { t } = useT();
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-9 w-9 rounded-xl bg-bg-raised flex items-center justify-center shrink-0">
        <FlaskConical size={16} className="text-text-muted" strokeWidth={1.6} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text-primary">{t("trends.ketoneCtaTitle")}</p>
        <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{t("trends.ketoneCtaSubtitle")}</p>
      </div>
      <Link
        href={href}
        className="inline-flex items-center gap-1 rounded-full bg-bg-surface border border-border-soft px-3 py-1.5 text-xs font-medium text-mint-600 shrink-0 hover:border-mint-500/40 transition-colors"
      >
        <Plus size={12} strokeWidth={2.5} />
        {t("trends.ketoneCtaTitle")}
      </Link>
    </div>
  );
}
