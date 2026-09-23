import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import localFont from "next/font/local";
import { routing } from "@/i18n/routing";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import "../globals.css";

const passionaSans = localFont({
  src: "../../public/fonts/inter-variable.woff2",
  display: "optional",
  preload: false,
  variable: "--font-passiona",
  weight: "100 900",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F2F6FB",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://passiona.ai"),
  title: {
    default: "Passiona",
    template: "%s — Passiona",
  },
  description: "Build the AI. Understand how it works. Run it in a living city.",
  openGraph: {
    siteName: "Passiona",
    type: "website",
  },
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const allMessages = await getMessages();
  const messages = {
    Nav: allMessages.Nav,
    Lang: allMessages.Lang,
    Form: allMessages.Form,
  };

  return (
    <html
      lang={locale}
      className={`${passionaSans.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-page text-body">
        <NextIntlClientProvider messages={messages}>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
