import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "TradeOS — Trading discipline, quantified",
    template: "%s · TradeOS",
  },
  description:
    "TradeOS is the discipline engine for day traders. Import your trades, enforce your rulebook, and turn analytics into a repeatable edge.",
  applicationName: "TradeOS",
  manifest: "/manifest.webmanifest",
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
