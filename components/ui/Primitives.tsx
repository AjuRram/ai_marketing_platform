import React from "react";
import clsx from "clsx";

/* ------------------------------------------------------------------- Card -- */

export function Card({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    // `min-w-0` by default. A Card is almost always a grid or flex child, and
    // such children default to `min-width: auto` — meaning they refuse to
    // shrink below their widest descendant. A table inside an `overflow-x-auto`
    // container then blows the whole column out and the PAGE scrolls sideways
    // instead of the container. Defaulting it here means no caller can forget.
    <div className={clsx("card min-w-0", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex items-start justify-between gap-3 border-b border-hairline px-4 py-3",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
        {subtitle ? <p className="mt-0.5 truncate text-xs text-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* ----------------------------------------------------------------- Button -- */

type ButtonVariant = "primary" | "outline" | "ghost" | "danger" | "subtle";
type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-brand-ink hover:bg-brand/90 active:bg-brand/80 disabled:hover:bg-brand",
  outline:
    "border border-hairline text-ink hover:border-brand hover:text-brand disabled:hover:border-hairline disabled:hover:text-ink",
  ghost: "text-muted hover:bg-raised hover:text-ink",
  danger: "bg-down text-white hover:bg-down/90",
  subtle: "bg-raised text-ink hover:bg-raised/70",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-7 gap-1 rounded-soft px-2.5 text-2xs",
  md: "h-9 gap-1.5 rounded-soft px-3.5 text-xs",
  lg: "h-11 gap-2 rounded-soft px-5 text-sm",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  block,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex select-none items-center justify-center font-semibold transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-45",
        VARIANTS[variant],
        SIZES[size],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ Badge -- */

type Tone = "neutral" | "brand" | "up" | "down" | "warn" | "info" | "email" | "social" | "blog";

const TONES: Record<Tone, string> = {
  neutral: "bg-raised text-muted",
  brand: "bg-brand/14 text-brand",
  up: "bg-up/14 text-up",
  down: "bg-down/14 text-down",
  warn: "bg-warn/14 text-warn",
  info: "bg-info/14 text-info",
  email: "bg-email/14 text-email",
  social: "bg-social/14 text-social",
  blog: "bg-blog/14 text-blog",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-2xs font-semibold",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A small live dot with an expanding ring, for "running" states. */
export function LiveDot({ tone = "up", className }: { tone?: Tone; className?: string }) {
  const color = tone === "up" ? "bg-up" : tone === "warn" ? "bg-warn" : "bg-brand";
  return (
    <span className={clsx("relative inline-flex h-2 w-2 shrink-0", className)}>
      <span className={clsx("absolute inset-0 rounded-full animate-pulse-ring", color)} />
      <span className={clsx("relative inline-flex h-2 w-2 rounded-full", color)} />
    </span>
  );
}

/* ------------------------------------------------------------------- Stat -- */

export function Stat({
  label,
  value,
  sub,
  icon,
  tone,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "up" | "down" | "brand";
  className?: string;
}) {
  return (
    <div className={clsx("card min-w-0 px-3.5 py-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow truncate">{label}</p>
        {icon ? <span className="shrink-0 text-faint">{icon}</span> : null}
      </div>
      <p
        className={clsx(
          "tnum mt-1.5 truncate text-lg font-bold leading-tight",
          tone === "up" && "text-up",
          tone === "down" && "text-down",
          tone === "brand" && "text-brand",
          !tone && "text-ink",
        )}
      >
        {value}
      </p>
      {sub ? <p className="mt-0.5 truncate text-2xs text-muted">{sub}</p> : null}
    </div>
  );
}

/* -------------------------------------------------------------- Segmented -- */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<{ value: T; label: React.ReactNode }>;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={clsx(
        "inline-flex items-center gap-0.5 rounded-soft bg-raised p-0.5",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={clsx(
              "rounded-[7px] font-semibold transition-colors",
              size === "sm" ? "px-2 py-1 text-2xs" : "px-2.5 py-1.5 text-xs",
              active
                ? "bg-surface text-ink shadow-sm"
                : "text-muted hover:text-ink",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------ Empty state -- */

export function Empty({
  icon,
  title,
  hint,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon ? <div className="text-faint">{icon}</div> : null}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {hint ? <p className="max-w-sm text-xs leading-relaxed text-muted">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------- Meter bar -- */

export function Meter({
  value,
  max,
  tone = "brand",
  className,
}: {
  value: number;
  max: number;
  tone?: "brand" | "up" | "warn" | "down";
  className?: string;
}) {
  const pctRaw = max <= 0 ? 0 : (value / max) * 100;
  const pct = Math.min(100, Math.max(0, pctRaw));
  const fill =
    tone === "up" ? "bg-up" : tone === "warn" ? "bg-warn" : tone === "down" ? "bg-down" : "bg-brand";
  return (
    <div
      className={clsx("h-1.5 w-full overflow-hidden rounded-full bg-raised", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={clsx("h-full rounded-full transition-[width] duration-500", fill)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ Table -- */

export function Th({
  children,
  right,
  className,
}: {
  children: React.ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <th
      className={clsx(
        "whitespace-nowrap px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider text-faint",
        right ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  right,
  className,
}: {
  children: React.ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <td className={clsx("px-4 py-2.5 text-xs", right && "text-right", className)}>
      {children}
    </td>
  );
}

/* ---------------------------------------------------------------- Avatar -- */

export function Avatar({ label, className }: { label: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-raised text-2xs font-bold text-muted",
        className,
      )}
    >
      {label}
    </span>
  );
}
