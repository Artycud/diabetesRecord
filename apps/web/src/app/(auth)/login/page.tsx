"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { LangSwitcher } from "@/components/lang-switcher";

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const { t } = useT();
  const [error, setError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setError("");
    try {
      const user = await login(data.username, data.password);
      router.replace(user.profile?.onboarded_at ? "/home" : "/onboarding");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.loginFailed"));
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-wrap justify-between items-start gap-4 mb-1">
          <h2 className="text-xl font-semibold text-text-primary tracking-tight">{t("auth.loginTitle")}</h2>
          <LangSwitcher variant="card" />
        </div>
        <p className="text-sm text-muted mb-6">{t("auth.loginWelcome")}</p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label={t("auth.username")}
            placeholder="your_username"
            autoComplete="username"
            error={errors.username ? t("auth.err.usernameRequired") : undefined}
            {...register("username")}
          />
          <Input
            label={t("auth.password")}
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            error={errors.password ? t("auth.err.passwordRequired") : undefined}
            {...register("password")}
          />

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? t("auth.loginSubmitting") : t("auth.loginSubmit")}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-muted">
          {t("auth.noAccount")}{" "}
          <Link href="/register" className="font-medium text-mint-600 hover:underline">
            {t("auth.registerSubmit")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
