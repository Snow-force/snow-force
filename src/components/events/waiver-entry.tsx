"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { loadEventWaiverAction } from "@/lib/registrations/v2/actions";
import { EmailedWaiverForm } from "./emailed-waiver-form";
import { useLanguage } from "@/lib/language";

type Loaded = NonNullable<Awaited<ReturnType<typeof loadEventWaiverAction>>>;
function loadInvitation(token: string) { const form = new FormData(); form.set("token", token); return loadEventWaiverAction(form); }
function readToken() { return window.location.hash.slice(1); }
function subscribeToken(changed: () => void) {
  // Separate people's links must start fresh router/cookie action state, even when only the fragment changes.
  const switchInvitation = () => { changed(); window.location.reload(); };
  window.addEventListener("hashchange", switchInvitation);
  return () => window.removeEventListener("hashchange", switchInvitation);
}
export function WaiverEntry() {
  const { t } = useLanguage();
  const token = useSyncExternalStore(subscribeToken, readToken, () => "");
  const [state, setState] = useState<{ token: string; invitation: Loaded | null; failed: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    if (!/^[a-f0-9]{64}$/.test(token)) return;
    loadInvitation(token).then((invitation) => { if (active) setState({ token, invitation, failed: !invitation }); })
      .catch(() => { if (active) setState({ token, invitation: null, failed: true }); });
    return () => { active = false; };
  }, [token]);
  if (!/^[a-f0-9]{64}$/.test(token)) return <p className="card">{t({ en: "Use the complete private link from your email.", zh: "请使用邮件中的完整私人链接。" })}</p>;
  if (!state || state.token !== token) return <p role="status" className="card">{t({ en: "Loading your private waiver…", zh: "正在加载个人免责…" })}</p>;
  if (state.failed || !state.invitation) return <p className="card">{t({ en: "Waiver unavailable. Use the complete link from your email or contact hello@snow-force.com.", zh: "免责邀请不可用，请使用邮件中的完整链接，或联系 hello@snow-force.com。" })}</p>;
  return <EmailedWaiverForm key={state.token} token={state.token} {...state.invitation} onRecorded={async () => {
    const invitation = await loadInvitation(state.token); if (readToken() === state.token) setState({ ...state, invitation, failed: !invitation });
  }} />;
}
