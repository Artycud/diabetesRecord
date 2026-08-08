"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { useTheme } from "next-themes";
import { AuthProvider } from "@/lib/auth";
import { LocaleProvider } from "@/lib/i18n";
import { UnitsProvider } from "@/lib/units";
import { TimezoneProvider } from "@/lib/timezone";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Toaster as Sonner } from "sonner";

function ThemedSonner() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return (
    <Sonner
      theme={isDark ? "dark" : "light"}
      toastOptions={{
        style: isDark
          ? { background: "#1F1F1F", border: "1px solid #262626", color: "#FAFAFA" }
          : { background: "#FFFFFF", border: "1px solid #EEEDE8", color: "#0A0A0A" },
      }}
    />
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      })
  );

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <LocaleProvider>
          <UnitsProvider>
            <TimezoneProvider>
              <AuthProvider>
                {children}
                <Toaster />
                <ThemedSonner />
              </AuthProvider>
            </TimezoneProvider>
          </UnitsProvider>
        </LocaleProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
