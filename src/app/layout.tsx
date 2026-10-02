import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "TradeOS — Trading discipline, quantified",
    template: "%s · TradeOS",
  },
  description:
    "TradeOS is the trading journal that keeps you honest. Import your trades, grade every one against your own rules, and get a warning at 50%, 80% and 100% of a limit. You decide what to do.",
  applicationName: "TradeOS",
  manifest: "/manifest.webmanifest",
  // iPhone home-screen icons must be PNG (the SVG icon is used everywhere else).
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
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
      "The trading journal that keeps you honest. Import your trades, grade every one against your rulebook, and turn raw fills into a discipline score you can improve.",
    url: appUrl,
    siteName: "TradeOS",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TradeOS — Trading discipline, quantified",
    description:
      "The trading journal that keeps you honest, for day & funded traders. Grades your trades against your Rulebook and warns you at 50/80/100% of a limit. You decide.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0c10" },
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // Lets the page reach under the phone's home indicator so
  // env(safe-area-inset-bottom) is real (the bottom bar pads by it).
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
