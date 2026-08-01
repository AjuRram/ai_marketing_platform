"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  LayoutDashboard,
  Sparkles,
  Users,
  FileText,
  Workflow,
  Brain,
  Settings,
  Sun,
  Moon,
  Zap,
} from "lucide-react";
import { Meter } from "../ui/Primitives";

export interface ShellBusiness {
  name: string;
  planLabel: string;
  creditsUsed: number;
  creditsLimit: number;
  userName: string;
  userEmail: string;
}

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/agent", label: "Agent", icon: Sparkles },
  { href: "/audience", label: "Audience", icon: Users },
  { href: "/content", label: "Content", icon: FileText },
  { href: "/flows", label: "Flows", icon: Workflow },
  { href: "/memory", label: "Memory", icon: Brain },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

// The mobile tab bar shows five of the seven. Settings and Flows live behind
// the dashboard on small screens — a seven-item tab bar produces 50px targets,
// below the 44px minimum once padding is accounted for.
const MOBILE_NAV = NAV.filter((n) =>
  ["/dashboard", "/agent", "/audience", "/content", "/memory"].includes(n.href),
);

export function AppShell({
  business,
  children,
}: {
  business: ShellBusiness;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-dvh bg-canvas">
      <Sidebar business={business} isActive={isActive} />

      {/* Left padding matches the fixed sidebar width on desktop only. */}
      <div className="lg:pl-[228px]">
        <TopBar business={business} />
        <main className="mx-auto w-full max-w-shell px-4 pb-24 pt-5 sm:px-6 lg:pb-10">
          {children}
        </main>
      </div>

      <TabBar isActive={isActive} />
    </div>
  );
}

/* ---------------------------------------------------------------- sidebar -- */

function Sidebar({
  business,
  isActive,
}: {
  business: ShellBusiness;
  isActive: (href: string) => boolean;
}) {
  const pctUsed = business.creditsLimit
    ? (business.creditsUsed / business.creditsLimit) * 100
    : 0;

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[228px] flex-col border-r border-hairline bg-surface lg:flex">
      <div className="flex h-14 items-center gap-2 border-b border-hairline px-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-soft bg-brand text-brand-ink">
          <Zap size={15} strokeWidth={2.75} />
        </span>
        <span className="text-sm font-bold tracking-tight text-ink">Pulse</span>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "flex items-center gap-2.5 rounded-soft px-2.5 py-2 text-xs font-semibold transition-colors",
                active
                  ? "bg-brand/12 text-brand"
                  : "text-muted hover:bg-raised hover:text-ink",
              )}
            >
              <Icon size={15} strokeWidth={2.25} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-hairline p-3">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="eyebrow">AI credits</span>
          <span className="tnum text-2xs font-semibold text-muted">
            {business.creditsUsed.toLocaleString("en-US")} /{" "}
            {business.creditsLimit.toLocaleString("en-US")}
          </span>
        </div>
        <Meter
          value={business.creditsUsed}
          max={business.creditsLimit}
          tone={pctUsed > 85 ? "down" : pctUsed > 60 ? "warn" : "brand"}
        />
        <p className="mt-2 truncate text-2xs text-faint">
          {business.name} · {business.planLabel}
        </p>
      </div>
    </aside>
  );
}

/* ----------------------------------------------------------------- topbar -- */

function TopBar({ business }: { business: ShellBusiness }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-hairline bg-canvas/85 px-4 backdrop-blur-md sm:px-6">
      <span className="flex items-center gap-2 lg:hidden">
        <span className="flex h-7 w-7 items-center justify-center rounded-soft bg-brand text-brand-ink">
          <Zap size={15} strokeWidth={2.75} />
        </span>
        <span className="text-sm font-bold tracking-tight text-ink">Pulse</span>
      </span>

      <div className="ml-auto flex items-center gap-2">
        <span className="hidden text-2xs text-muted sm:inline">{business.userEmail}</span>
        <ThemeToggle />
      </div>
    </header>
  );
}

/**
 * Theme toggle.
 *
 * `mounted` gates the icon because the applied theme is decided by a blocking
 * script in <head> reading localStorage — information the server render cannot
 * have. Rendering the "real" icon before mount would mismatch on hydration for
 * anyone whose stored theme differs from the default, so a fixed placeholder
 * is rendered first and swapped after mount.
 */
function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.classList.contains("light"));
    setMounted(true);
  }, []);

  const toggle = () => {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle("light", next);
    try {
      localStorage.setItem("pulse:theme", next ? "light" : "dark");
    } catch {
      /* private mode — the theme just won't persist */
    }
  };

  return (
    <button
      onClick={toggle}
      aria-label={mounted ? (light ? "Switch to dark theme" : "Switch to light theme") : "Toggle theme"}
      className="flex h-8 w-8 items-center justify-center rounded-soft text-muted transition-colors hover:bg-raised hover:text-ink"
    >
      {mounted && light ? <Moon size={15} /> : <Sun size={15} />}
    </button>
  );
}

/* ---------------------------------------------------------------- tab bar -- */

function TabBar({ isActive }: { isActive: (href: string) => boolean }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-hairline bg-surface/95 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {MOBILE_NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition-colors",
              active ? "text-brand" : "text-faint hover:text-muted",
            )}
          >
            <Icon size={17} strokeWidth={2.25} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
