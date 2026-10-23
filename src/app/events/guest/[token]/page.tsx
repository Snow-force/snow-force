import type { Metadata } from "next";
import { GuestInvitationForm } from "@/components/events/guest-invitation-form";
import { getGuestInvitation } from "@/lib/registrations/guest-invitations";
import { buildQrCodeDataUrl } from "@/lib/events/share-payload";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "SnowForce invitation", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function GuestInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await getGuestInvitation(token);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const qr = invitation ? await buildQrCodeDataUrl(`${siteUrl}/events/guest/${token}`) : null;
  return <section className="mx-auto max-w-2xl px-5 py-12" aria-label="Personal event invitation">{invitation
    ? <GuestInvitationForm token={token} {...invitation} qrDataUrl={qr?.dataUrl} />
    : <p className="card">Invitation unavailable / 邀请不可用。请联系代报名人获取新链接。</p>}</section>;
}
