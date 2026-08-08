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
import { Dialog } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { LangSwitcher } from "@/components/lang-switcher";
import { th } from "@/i18n/locales/th";
import { en } from "@/i18n/locales/en";
import { twMerge } from "tailwind-merge";
import { Eye, EyeOff } from "lucide-react";

const GOALS: { value: string; img: string }[] = [
  { value: "keto",     img: "/goal-keto.webp" },
  { value: "fasting",  img: "/goal-fasting.webp" },
  { value: "exercise", img: "/goal-exercise.webp" },
  { value: "monitor",  img: "/goal-monitor.webp" },
];

const schema = z.object({
  email:            z.string().email(),
  password:         z.string().min(8),
  confirm_password: z.string().min(1),
  display_name:     z.string().min(1),
  goal_types:       z.array(z.string()).min(1),
}).refine((d) => d.password === d.confirm_password, {
  path: ["confirm_password"],
  message: "mismatch",
});
type FormData = z.infer<typeof schema>;

type LegalModal = "terms" | "privacy" | null;

export default function RegisterPage() {
  const { register: authRegister } = useAuth();
  const router = useRouter();
  const { t, locale } = useT();
  const dict = locale === "th" ? th : en;
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [legalModal, setLegalModal] = useState<LegalModal>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { goal_types: [] },
  });

  const selectedGoals = watch("goal_types");

  const toggleGoal = (value: string) => {
    const current = selectedGoals ?? [];
    const next = current.includes(value)
      ? current.filter((g) => g !== value)
      : [...current, value];
    setValue("goal_types", next, { shouldValidate: true });
  };

  const onSubmit = async (data: FormData) => {
    setError("");
    try {
      await authRegister({
        username:     data.email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "_"),
        email:        data.email,
        password:     data.password,
        display_name: data.display_name,
        goal_type:    data.goal_types[0],
      });
      sessionStorage.setItem("signup_goals", JSON.stringify(data.goal_types));
      router.replace("/onboarding");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.registerFailed"));
    }
  };

  const fieldErr = (k: keyof FormData): string | undefined => {
    if (!errors[k]) return undefined;
    switch (k) {
      case "email":            return t("auth.err.emailInvalid");
      case "password":         return t("auth.err.passwordMin");
      case "confirm_password":
        return errors.confirm_password?.type === "too_small"
          ? t("auth.err.confirmRequired")
          : t("auth.err.passwordMismatch");
      case "display_name":     return t("auth.err.displayNameRequired");
      case "goal_types":       return t("auth.err.goalRequired");
      default:                 return undefined;
    }
  };

  const eyeBtn = (visible: boolean, toggle: () => void) => (
    <button
      type="button"
      tabIndex={-1}
      onClick={toggle}
      className="text-gray-400 hover:text-gray-600 transition-colors"
      aria-label={visible ? "Hide password" : "Show password"}
    >
      {visible ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  );

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
          <h2 className="text-xl font-semibold text-text-primary tracking-tight">{t("auth.registerTitle")}</h2>
          <LangSwitcher variant="card" />
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t("auth.email")}
              type="email"
              placeholder="Enter your email address"
              autoComplete="email"
              required
              error={fieldErr("email")}
              {...register("email")}
            />
            <Input
              label={t("auth.displayName")}
              placeholder="Enter your name"
              required
              error={fieldErr("display_name")}
              {...register("display_name")}
            />
          </div>
          <Input
            label={t("auth.password")}
            type={showPassword ? "text" : "password"}
            placeholder={t("auth.passwordHint")}
            autoComplete="new-password"
            required
            error={fieldErr("password")}
            rightElement={eyeBtn(showPassword, () => setShowPassword((v) => !v))}
            {...register("password")}
          />
          <Input
            label={t("auth.passwordConfirmHint")}
            type={showConfirm ? "text" : "password"}
            placeholder={t("auth.passwordConfirmHint")}
            autoComplete="new-password"
            required
            error={fieldErr("confirm_password")}
            rightElement={eyeBtn(showConfirm, () => setShowConfirm((v) => !v))}
            {...register("confirm_password")}
          />

          {/* Goal selector */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-text-primary">{t("auth.goalPrompt")}</p>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("auth.goalPrompt")}>
              {GOALS.map(({ value, img }) => {
                const label = t(`goal.${value}`);
                const desc = t(`goal.${value}Desc`);
                const active = (selectedGoals ?? []).includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleGoal(value)}
                    className={twMerge(
                      // Use inset box-shadow instead of border+ring so the accent
                      // stroke sits ON TOP of the image without creating a visible
                      // gap between the border and the illustration (the effect
                      // that made the "Health monitoring" card look framed).
                      "rounded-xl text-left transition-all overflow-hidden",
                      active
                        ? "shadow-[inset_0_0_0_2px_#01D19B]"
                        : "shadow-[inset_0_0_0_1px_var(--color-border-soft)] hover:shadow-[inset_0_0_0_1px_#7BC97C]",
                    )}
                  >
                    {/* Illustration header */}
                    <div className="relative">
                      <img
                        src={img}
                        alt={label}
                        className="w-full object-cover block"
                        style={{ height: 72, objectPosition: "center" }}
                        draggable={false}
                      />
                      {active && (
                        <div className="absolute inset-0 bg-mint-500/12 pointer-events-none" />
                      )}
                    </div>
                    {/* Text */}
                    <div className={twMerge(
                      "p-2.5 transition-colors",
                      active ? "bg-mint-50/60" : "bg-white"
                    )}>
                      <p className="text-sm font-semibold text-gray-900 leading-tight">{label}</p>
                      <p className="text-[11px] text-muted mt-0.5 leading-relaxed">{desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            {errors.goal_types && (
              <p className="text-xs text-red-500">{t("auth.err.goalRequired")}</p>
            )}
          </div>

          {/* Terms */}
          <div className="text-xs text-muted text-center space-y-0.5">
            <p>{t("auth.agreePrefix")}</p>
            <p className="whitespace-nowrap">
              <button
                type="button"
                onClick={() => setLegalModal("terms")}
                className="text-mint-600 hover:underline"
              >
                {t("auth.terms")}
              </button>
              {" "}{t("auth.termsAnd")}{" "}
              <button
                type="button"
                onClick={() => setLegalModal("privacy")}
                className="text-mint-600 hover:underline"
              >
                {t("auth.privacy")}
              </button>
            </p>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? t("auth.registerSubmitting") : t("auth.registerSubmit")}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-muted">
          {t("auth.haveAccount")}{" "}
          <Link href="/login" className="font-medium text-mint-600 hover:underline">
            {t("auth.loginSubmit")}
          </Link>
        </p>
      </CardContent>

      <Dialog
        open={legalModal === "terms"}
        onClose={() => setLegalModal(null)}
        title={dict.auth.termsTitle}
      >
        {dict.auth.termsContent.map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </Dialog>

      <Dialog
        open={legalModal === "privacy"}
        onClose={() => setLegalModal(null)}
        title={dict.auth.privacyTitle}
      >
        {dict.auth.privacyContent.map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </Dialog>
    </Card>
  );
}
