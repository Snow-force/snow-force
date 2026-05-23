import type { Metadata } from "next";
import { LanguageProvider } from "@/lib/language";
import { Nav } from "@/components/site/nav";
import { Footer } from "@/components/site/footer";
import "./globals.css";

export const metadata: Metadata = {
  title: "SnowForce - Community Snow Sports in China",
  description:
    "SnowForce is a community-driven snow sports platform organizing events, training, and social gatherings for riders of all levels in China.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body className="flex min-h-screen flex-col">
        <LanguageProvider>
          <Nav />
          <main className="flex-1">{children}</main>
          <Footer />
        </LanguageProvider>
      </body>
    </html>
  );
}
