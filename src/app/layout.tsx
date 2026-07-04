import type { Metadata, Viewport } from "next";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "TradeOS — Trading discipline, quantified",
    template: "%s · TradeOS",
  },
  description:
    "TradeOS is the discipline engine for day traders. Import your trades, enforce your rulebook, and turn analytics into a repeatable edge.",
  applicationName: "TradeOS",
  manifest: "/manifest.webmanifest",
  keywords: [
    "trading journal",
    "day trading analytics",
    "prop firm tracker",
    "trading discipline",
    "trade journal app",
    "futures trading journal",
    "Topstep tracker",
  ],
  openGraph: {
    title: "TradeOS — Trading discipline, quantified",
    description:
      "Import your trades, grade every one against your rulebook, and turn raw fills into a discipline score you can improve.",
    url: appUrl,
    siteName: "TradeOS",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TradeOS — Trading discipline, quantified",
    description:
      "The discipline engine for day & funded traders. Rulebook enforcement, analytics, and prop-firm guardrails.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0f1a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
