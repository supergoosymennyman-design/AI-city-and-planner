"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import LanguageSwitcher from "./LanguageSwitcher";
import MobileNav from "./MobileNav";

export default function Header() {
  const t = useTranslations("Nav");
  const links = [
    ["programme", "programme"],
    ["tools", "tools"],
    ["outcomes", "outcomes"],
    ["demo", "demo-form"],
  ] as const;

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link
          href="/"
          className="brand-mark"
        >
          {t("brand")}
        </Link>

        <nav aria-label={t("primaryNavigation")} className="desktop-nav">
          {links.map(([key, hash]) => (
            <Link key={key} href={{ pathname: "/", query: {}, hash }}>
              {t(key)}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher />
          <Link
            href={{ pathname: "/", query: {}, hash: "demo-form" }}
            className="header-enquiry"
          >
            {t("bookDemo")}
          </Link>
          <MobileNav links={links.map(([key, hash]) => ({ label: t(key), hash }))} />
        </div>
      </div>
    </header>
  );
}
