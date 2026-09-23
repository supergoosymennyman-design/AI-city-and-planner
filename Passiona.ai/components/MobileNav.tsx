"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";

export default function MobileNav({ links }: { links: { label: string; hash: string }[] }) {
  const t = useTranslations("Nav");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? t("closeMenu") : t("openMenu")}
        onClick={() => setOpen((v) => !v)}
        className="flex h-12 w-12 items-center justify-center rounded-full border border-ink/20 text-body lg:hidden"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          {open ? (
            <path d="M6 6l12 12M18 6L6 18" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" />
          )}
        </svg>
      </button>

      {open && (
        <nav
          aria-label={t("primaryNavigation")}
          className="mobile-menu"
        >
          {links.map((link) => (
            <Link
              key={link.hash}
              href={{ pathname: "/", query: {}, hash: link.hash }}
              onClick={() => setOpen(false)}
              className="mobile-menu-link"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href={{ pathname: "/", query: {}, hash: "demo-form" }}
            onClick={() => setOpen(false)}
            className="mt-2 flex h-12 items-center justify-center rounded-full bg-teal px-5 text-sm font-bold text-navy"
          >
            {t("bookDemo")}
          </Link>
        </nav>
      )}
    </>
  );
}
