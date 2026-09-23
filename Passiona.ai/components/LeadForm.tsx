"use client";

import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

type State = { status: "idle" | "error" | "success" } | undefined;

async function submitAction(_prev: State, formData: FormData): Promise<State> {
  const payload = Object.fromEntries(formData.entries());
  try {
    const res = await fetch("/api/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { status: "error" };
    return { status: "success" };
  } catch {
    return { status: "error" };
  }
}

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("Form");
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-14 items-center justify-center rounded-full bg-teal px-8 text-base font-bold text-navy transition-transform hover:-translate-y-0.5 hover:bg-teal/90 disabled:opacity-60"
    >
      {pending ? "…" : t("submit")}
    </button>
  );
}

export default function LeadForm() {
  const t = useTranslations("Form");
  const [state, action] = useActionState(submitAction, undefined);

  if (state?.status === "success") {
    return (
      <div className="rounded-2xl border border-success/40 bg-success/10 p-8 text-center">
        <p className="text-lg font-bold text-success">{t("success")}</p>
      </div>
    );
  }

  return (
    <form
      action={action}
      className="grid max-w-2xl gap-5 text-left sm:grid-cols-2"
    >
      <fieldset className="flex flex-col gap-3 sm:col-span-2">
        <legend className="text-sm font-bold text-body">
          {t("enquiryType")} <span className="text-amber">*</span>
        </legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {(["freeLesson", "demo", "trainingDelivery"] as const).map((option) => (
            <label
              key={option}
              className="flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border border-ink/20 bg-surface p-4 text-sm font-semibold text-body transition-colors hover:border-teal has-[:focus-visible]:border-teal has-[:checked]:border-teal has-[:checked]:bg-teal/10"
            >
              <input
                type="radio"
                name="enquiryType"
                value={option}
                required
                className="h-4 w-4 shrink-0 accent-teal"
              />
              {t(`enquiryOptions.${option}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor="name" className="text-sm font-bold text-body">
          {t("name")} <span className="text-amber">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoComplete="name"
          className="h-12 rounded-xl border border-ink/20 bg-surface px-4 text-body outline-none transition-colors focus:border-teal"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="school" className="text-sm font-bold text-body">
          {t("school")} <span className="text-amber">*</span>
        </label>
        <input
          id="school"
          name="school"
          type="text"
          required
          className="h-12 rounded-xl border border-ink/20 bg-surface px-4 text-body outline-none transition-colors focus:border-teal"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-sm font-bold text-body">
          {t("email")}{" "}
          <span className="text-body/50">{t("emailOptional")}</span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          className="h-12 rounded-xl border border-ink/20 bg-surface px-4 text-body outline-none transition-colors focus:border-teal"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="whatsapp" className="text-sm font-bold text-body">
          {t("whatsapp")}{" "}
          <span className="text-body/50">{t("whatsappOptional")}</span>
        </label>
        <input
          id="whatsapp"
          name="whatsapp"
          type="tel"
          autoComplete="tel"
          className="h-12 rounded-xl border border-ink/20 bg-surface px-4 text-body outline-none transition-colors focus:border-teal"
        />
      </div>

      <div className="flex flex-col gap-2 sm:col-span-2">
        <label htmlFor="needs" className="text-sm font-bold text-body">
          {t("needs")}{" "}
          <span className="text-body/50">{t("needsOptional")}</span>
        </label>
        <textarea
          id="needs"
          name="needs"
          rows={4}
          className="rounded-xl border border-ink/20 bg-surface px-4 py-3 text-body outline-none transition-colors focus:border-teal"
        />
      </div>

      {state?.status === "error" && (
        <p role="alert" className="text-sm font-bold text-amber sm:col-span-2">
          {t("error")}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:col-span-2">
        <p className="text-xs text-body/50">{t("requiredHint")}</p>
        <p className="text-xs leading-relaxed text-body/60">{t("privacyNotice")} <Link href="/privacy" className="font-semibold text-teal underline underline-offset-2">{t("privacyLink")}</Link>.</p>
        <SubmitButton />
        <a
          href="https://wa.me/85253004224"
          aria-label={t("chatOnWhatsApp")}
          className="w-fit rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
        >
          <Image
            src="/contact/WhatsAppButtonGreenLarge.svg"
            width="207"
            height="48"
            alt=""
          />
        </a>
      </div>
    </form>
  );
}
