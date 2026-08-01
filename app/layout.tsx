import type { Metadata, Viewport } from "next";
import { Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Deliberately not Inter/Roboto/system-ui. Instrument Sans has real character
// at UI sizes; JetBrains Mono carries paths, IDs, tool names and token counts.
const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Pulse — agentic marketing",
    template: "%s · Pulse",
  },
  description:
    "An AI agent that plans and executes marketing campaigns end to end — audience, content, flows and memory in one place.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0A0B0D" },
    { media: "(prefers-color-scheme: light)", color: "#FBFAF9" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Applied before first paint, so a light-theme user never sees a dark flash.
 *
 * It has to be a blocking inline script: any React-driven approach necessarily
 * runs after hydration, which is after the first paint has already happened.
 * `suppressHydrationWarning` on <html> is required because this script mutates
 * the class list before React attaches, which React would otherwise report as
 * a server/client attribute mismatch.
 */
const THEME_BOOTSTRAP = `
(function () {
  try {
    var stored = localStorage.getItem("pulse:theme");
    var prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    if (stored === "light" || (!stored && prefersLight)) {
      document.documentElement.classList.add("light");
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="font-[family-name:var(--font-sans)] antialiased">{children}</body>
    </html>
  );
}
