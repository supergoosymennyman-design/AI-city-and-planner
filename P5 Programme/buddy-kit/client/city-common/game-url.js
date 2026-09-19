/** Resolve first; allow only explicit registry origins AND paths. */
export function allowedGameUrl(raw, base, destinations) {
  if (typeof raw !== 'string' || !raw.trim()) return false;
  try {
    const url = new URL(raw, base);
    const here = new URL(base);
    if (url.username || url.password) return false;
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.origin === here.origin)) return false;
    return destinations.filter(v => typeof v === 'string').some(value => {
      const approved = new URL(value, base);
      return url.origin === approved.origin && url.pathname === approved.pathname && url.search === approved.search;
    });
  } catch { return false; }
}
