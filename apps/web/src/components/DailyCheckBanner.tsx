"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { Banner } from "@/components/ui/Banner";
import { BreathPulse } from "@/components/ui/BreathPulse";
import { useDemoMode } from "@/lib/demoMode";

interface DailyCheckBannerProps {
  checkedInToday: boolean;
  hasDevice: boolean;
  /** Streak threshold crossed or a badge just unlocked this session. */
  celebrate?: boolean;
}

/**
 * The satisfying, in-app (never a native push/permission prompt) daily
 * nudge — replaces the old buried "start session" text link on Home.
 * No dismiss control: it's meant to invite, not to be managed chrome.
 */
export function DailyCheckBanner({ checkedInToday, hasDevice, celebrate }: DailyCheckBannerProps) {
  const { demoMode } = useDemoMode();

  if (checkedInToday) {
    return (
      <div key="done" className="animate-fade-rise-in">
        <Banner
          refract
          variant={celebrate ? "celebration" : "success"}
          icon={
            <div className="h-10 w-10 rounded-full bg-mint-500/15 flex items-center justify-center">
              <Check size={18} className="text-mint-500" strokeWidth={2.5} />
            </div>
          }
          title={celebrate ? "Streak milestone! 🎉" : "Today's check complete"}
          subtitle={celebrate ? "New badge unlocked — keep it going." : "See you again tomorrow."}
        />
      </div>
    );
  }

  const hour = new Date().getHours();
  const timeGreeting = hour < 11 ? "Good morning" : hour < 17 ? "This afternoon" : "This evening";

  return (
    <div key="pending" className="animate-fade-rise-in">
      <Banner
        refract
        icon={<BreathPulse size={48} />}
        title="Time for today's breath check"
        subtitle={
          hasDevice || demoMode
            ? `${timeGreeting} is a great time to check in.`
            : "No device yet? Try Demo Mode from your profile to see how it works."
        }
        action={
          <Link
            href="/breathing"
            className="inline-flex items-center justify-center rounded-full bg-mint-500 text-white text-sm font-semibold px-4 py-2 hover:bg-mint-400 transition-colors"
          >
            Start
          </Link>
        }
      />
    </div>
  );
}
