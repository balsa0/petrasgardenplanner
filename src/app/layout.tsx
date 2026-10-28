import type { Metadata, Viewport } from "next";
import { Geist_Mono, IBM_Plex_Mono, Space_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Monospace throughout, like a field notebook: Plex for text, Space Mono for titles and numbers.
const plex = IBM_Plex_Mono({
  variable: "--font-plex",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
});

const space = Space_Mono({
  variable: "--font-space",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Garden Planner",
  description: "Plan your garden step by step — plot, terrain, surfaces, trees, beds and planting — in 2D, 2.5D and 3D.",
};

export const viewport: Viewport = {
  themeColor: "#fcefda",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plex.variable} ${space.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="h-full overflow-hidden">
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        <Toaster position="top-center" offset={116} theme="light" richColors={false} closeButton />
      </body>
    </html>
  );
}
