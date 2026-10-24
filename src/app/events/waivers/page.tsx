import type { Metadata } from "next";
import { WaiverEntry } from "@/components/events/waiver-entry";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "SnowForce personal waiver", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function EmailedWaiverPage() {
  return <section className="mx-auto max-w-2xl px-5 py-12"><WaiverEntry /></section>;
}
