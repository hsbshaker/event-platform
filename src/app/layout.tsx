import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Application chrome family per docs/design-system.md §6.2. Event sites load their
// own curated pairings through the renderer, never through this layout.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Event Platform",
  description: "Describe the event you imagine. AI creates the site; you publish when ready.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="flex min-h-full flex-col bg-app-bg text-app-text">{children}</body>
    </html>
  );
}
