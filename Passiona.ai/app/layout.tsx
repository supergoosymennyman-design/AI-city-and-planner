// Root layout: pass-through only. The real <html>/<body> lives in
// app/[locale]/layout.tsx. Required because the root "/" page (locale
// redirect) lives outside the [locale] segment — no proxy/middleware on
// Cloudflare (OpenNext), so "/" is handled by app/page.tsx instead.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
