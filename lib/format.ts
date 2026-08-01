/**
 * Formatters.
 *
 * Every `Intl` formatter is constructed once, at module scope, with an
 * EXPLICIT locale. Both details matter:
 *
 *   - Constructing `Intl.NumberFormat` inside a render is measurably slow and
 *     shows up immediately in a table of a few hundred rows.
 *   - Omitting the locale makes output depend on the host's default, which
 *     differs between the Node process that renders the HTML and the browser
 *     that hydrates it. That is a guaranteed hydration mismatch on any page
 *     showing a formatted number or date.
 */

const LOCALE = "en-US";

const nf0 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd4 = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const pct1 = new Intl.NumberFormat(LOCALE, {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const dateShort = new Intl.DateTimeFormat(LOCALE, {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const dateFull = new Intl.DateTimeFormat(LOCALE, {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const timeShort = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

export const num = (n: number): string => nf0.format(n);
export const num1 = (n: number): string => nf1.format(n);
export const num2 = (n: number): string => nf2.format(n);

/** Cost display. Agent runs cost cents, so two decimals would read as "$0.00". */
export const usd = (n: number): string => (n === 0 ? "$0.00" : usd4.format(n));

export const pct = (fraction: number): string => pct1.format(fraction);

/** 1234 → "1.2k", 1_240_000 → "1.2M". For dense stat tiles. */
export function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${nf1.format(n / 1_000_000)}M`;
  if (abs >= 1_000) return `${nf1.format(n / 1_000)}k`;
  return nf0.format(n);
}

/** Token counts read better without decimals: 48_213 → "48.2k". */
export function tokens(n: number): string {
  if (n >= 1_000_000) return `${nf2.format(n / 1_000_000)}M`;
  if (n >= 1_000) return `${nf1.format(n / 1_000)}k`;
  return nf0.format(n);
}

export const shortDate = (ms: number): string => dateShort.format(new Date(ms));
export const fullDate = (ms: number): string => dateFull.format(new Date(ms));
export const clockTime = (ms: number): string => timeShort.format(new Date(ms));
export const dateTime = (ms: number): string =>
  `${dateShort.format(new Date(ms))} ${timeShort.format(new Date(ms))}`;

/**
 * Relative time.
 *
 * `now` is a parameter rather than a `Date.now()` call so a server render and
 * the subsequent hydration can be handed the same instant. Called without it
 * on the server, "3 minutes ago" would render, then re-render as "4 minutes
 * ago" on the client and mismatch.
 */
export function ago(ms: number, now: number): string {
  const secs = Math.max(0, Math.round((now - ms) / 1000));
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return fullDate(ms);
}

/** "in 2h" / "in 3d" for scheduled items. */
export function until(ms: number, now: number): string {
  const secs = Math.round((ms - now) / 1000);
  if (secs <= 0) return "due";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.round(hours / 24)}d`;
}

export function duration(msElapsed: number): string {
  if (msElapsed < 1000) return `${Math.round(msElapsed)}ms`;
  const s = msElapsed / 1000;
  if (s < 60) return `${nf1.format(s)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

export function initials(nameOrEmail: string): string {
  const source = nameOrEmail.includes("@") ? nameOrEmail.split("@")[0]! : nameOrEmail;
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

/** Tone class for a signed value — used by every P&L-style number. */
export const toneClass = (n: number): string =>
  n > 0 ? "text-up" : n < 0 ? "text-down" : "text-muted";
