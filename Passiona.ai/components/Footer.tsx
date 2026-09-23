import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import LanguageSwitcher from "./LanguageSwitcher";

export default async function Footer() {
  const t = await getTranslations("Footer");

  return (
    <footer className="border-t border-ink/10 bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          <p className="font-heading text-xl font-bold text-body">Passiona</p>
          <p className="text-sm text-body/60">{t("madeIn")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-bold">
          <Link href={"/privacy"} className="text-body/80 hover:text-teal">
            {t("privacy")}
          </Link>
          <Link href={"/terms"} className="text-body/80 hover:text-teal">
            {t("terms")}
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <LanguageSwitcher />
          <p className="text-sm text-body/60">{t("copyright")}</p>
        </div>
      </div>
    </footer>
  );
}
