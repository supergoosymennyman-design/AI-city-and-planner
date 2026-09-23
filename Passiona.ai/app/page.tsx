import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE = "NEXT_LOCALE";

// Root "/" handler (no proxy/middleware on Cloudflare): pick the locale from
// the persisted cookie first, then default to English. Visitors who never
// chose a language land on /en; the language switcher persists their choice.
export default async function RootPage() {
  const store = await cookies();
  const cookieLocale = store.get(COOKIE)?.value;
  if (cookieLocale === "en" || cookieLocale === "zh") {
    redirect(`/${cookieLocale}`);
  }
  redirect("/en");
}
