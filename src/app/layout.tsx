import type { Metadata, Viewport } from "next";
import { Alegreya_Sans } from "next/font/google";
import "./globals.css";

// Application chrome family per docs/design-system.md §6.2 (Revision 5): Alegreya Sans, a static
// family, so only the weights the type scale uses are loaded. Invitation cards load their own
// curated pairings through the card renderer, never through this layout.
const alegreyaSans = Alegreya_Sans({
  variable: "--font-alegreya-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Revelnote",
  description: "Describe the event you imagine. AI creates the invitation; you publish when ready.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${alegreyaSans.variable} h-full`}>
      <body className="flex min-h-full flex-col bg-app-bg text-app-text">{children}</body>
    </html>
  );
}
