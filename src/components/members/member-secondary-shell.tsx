"use client";

import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import type { MemberProfile } from "@/lib/types";
import { MemberAccountShell } from "./member-account-shell";

export function MemberSecondaryShell({ active, aside, children, profile, subtitle, title }: {
  active: "account" | "settings" | "trips";
  aside?: ReactNode;
  children: ReactNode;
  profile: MemberProfile;
  subtitle: string;
  title: string;
  user: User;
}) {
  return <MemberAccountShell active={active} profile={profile} title={title} subtitle={subtitle}>
    <div className={aside ? "grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_260px]" : ""}>
      <div className="min-w-0 space-y-6">{children}</div>
      {aside && <aside className="space-y-4">{aside}</aside>}
    </div>
  </MemberAccountShell>;
}
