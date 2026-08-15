import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DesignPreviewSwitcher } from "@/components/site/design-preview-switcher";
import { isDesignPreviewEnabled } from "@/lib/design-preview";

export const metadata: Metadata = {
  title: "SnowForce Local Design Preview",
  robots: { index: false, follow: false },
};

export default function DesignPreviewLayout({ children }: { children: React.ReactNode }) {
  if (!isDesignPreviewEnabled()) notFound();

  return (
    <>
      {children}
      <DesignPreviewSwitcher />
    </>
  );
}
