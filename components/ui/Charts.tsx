import React from "react";
import clsx from "clsx";

/**
 * Hand-written SVG charts.
 *
 * No charting library. At this scale a bar series and a sparkline are a `map`
 * over an array and some arithmetic — importing 40kB+ of Recharts to draw them
 * would cost more than it saves, and every library brings its own opinions
 * about colour and typography that then have to be fought back to match the
 * design tokens.
 *
 * All of these use `viewBox` with `preserveAspectRatio="none"` so they scale to
 * whatever box they are given without needing a resize observer or a client
 * component. That keeps them renderable on the server.
 */

export function BarSeries({
  data,
  height = 56,
  className,
  tone = "brand",
}: {
  data: number[];
  height?: number;
  className?: string;
  tone?: "brand" | "up" | "info";
}) {
  if (data.length === 0) return null;
  const max = Math.max(...data, 1);
  const gap = 0.18;
  const slot = 100 / data.length;
  const fill = tone === "up" ? "fill-up" : tone === "info" ? "fill-info" : "fill-brand";

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={clsx("w-full", className)}
      style={{ height }}
      role="img"
      aria-label={`Bar chart, ${data.length} points, peak ${max}`}
    >
      {data.map((value, i) => {
        const h = (value / max) * 100;
        return (
          <rect
            key={i}
            x={i * slot + (slot * gap) / 2}
            y={100 - h}
            width={slot * (1 - gap)}
            height={Math.max(h, value > 0 ? 1.5 : 0)}
            className={clsx(fill, "opacity-85")}
            rx="0.6"
          />
        );
      })}
    </svg>
  );
}

export function Sparkline({
  data,
  height = 32,
  tone = "brand",
  className,
}: {
  data: number[];
  height?: number;
  tone?: "brand" | "up" | "down";
  className?: string;
}) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 100 - ((v - min) / range) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const stroke = tone === "up" ? "stroke-up" : tone === "down" ? "stroke-down" : "stroke-brand";

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={clsx("w-full", className)}
      style={{ height }}
      role="img"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        className={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * Horizontal breakdown bar — one segment per category.
 * Used for the content-by-channel and status splits.
 */
export function StackBar({
  segments,
  className,
}: {
  segments: Array<{ label: string; value: number; className: string }>;
  className?: string;
}) {
  const total = segments.reduce((acc, s) => acc + s.value, 0);
  if (total === 0) return null;

  return (
    <div className={clsx("flex h-2 w-full overflow-hidden rounded-full bg-raised", className)}>
      {segments.map((s) =>
        s.value === 0 ? null : (
          <div
            key={s.label}
            className={s.className}
            style={{ width: `${(s.value / total) * 100}%` }}
            title={`${s.label}: ${s.value}`}
          />
        ),
      )}
    </div>
  );
}
