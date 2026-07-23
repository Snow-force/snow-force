"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/language";

export function MerchantBackLink() {
  const { t } = useLanguage();
  return <Link href="/merchant" className="text-sm font-semibold text-snow-700">← {t({ en: "Merchant dashboard", zh: "商家中心" })}</Link>;
}
