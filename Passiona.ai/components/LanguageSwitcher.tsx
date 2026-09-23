"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useTransition, useState } from "react";

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("Lang");
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const targetLocale = locale === "zh" ? "en" : "zh";
  const targetLabel = t(targetLocale === "zh" ? "switchToZh" : "switchToEn");

  function switchLocale() {
    setOpen(false);
    startTransition(() => {
      // No middleware on Cloudflare: persist the choice in the cookie so the
      // root "/" redirect (app/page.tsx) keeps the user's preference.
      try {
        document.cookie = `NEXT_LOCALE=${targetLocale};path=/;max-age=31536000;samesite=lax`;
      } catch {}
      router.replace(pathname, { locale: targetLocale });
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={targetLabel}
        onClick={() => setOpen((v) => !v)}
        className="flex h-12 min-w-12 items-center justify-center rounded-full border border-ink/20 px-4 text-sm font-bold text-body transition-colors hover:border-teal hover:text-teal disabled:opacity-50"
        disabled={isPending}
      >
        {locale === "zh" ? "中" : "EN"}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-max overflow-hidden rounded-xl border border-ink/10 bg-surface shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={switchLocale}
            className="flex h-12 w-full items-center gap-2 px-4 text-left text-sm font-bold text-body hover:bg-ink/5 hover:text-teal"
          >
            {targetLabel}
          </button>
        </div>
      )}
    </div>
  );
}
