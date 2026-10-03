import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LanguageProvider, type Lang } from "@/lib/language";
import { Nav } from "@/components/site/nav";
import { Footer } from "@/components/site/footer";
import "./globals.css";

export const metadata: Metadata = {
  title: "SnowForce - Community Snow Sports",
  description:
    "SnowForce is a community-driven snow sports platform organizing events, training, and social gatherings for riders of all levels.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieLang = (await cookies()).get("lang")?.value;
  const initialLang: Lang = cookieLang === "en" || cookieLang === "zh" ? cookieLang : "en";

  return (
    <html lang={initialLang} data-scroll-behavior="smooth">
      <body className="flex min-h-screen flex-col">
        <LanguageProvider initialLang={initialLang}>
          <Nav />
          <main className="flex-1">{children}</main>
          <Footer />
        </LanguageProvider>
      </body>
    </html>
  );
}
