import "./globals.css";
import Providers from "./providers";
import { Roboto_Condensed } from "next/font/google";
import type { Viewport } from "next";

export const metadata = {
  title: "Phylo Framework",
  description: "Phylogeny methods runner",
};

// `cover` lets the app paint under phone notches; the shell pads itself with
// `env(safe-area-inset-*)` where it matters (see DashboardTabBar).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const robotoCondensed = Roboto_Condensed({
  subsets: ["latin"],
  variable: "--font-roboto-condensed",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={robotoCondensed.variable}
    >
      <body className="h-dvh overflow-hidden">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
