import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeMemberNextPath } from "@/lib/members/auth-results";
import { sanitizeMerchantNextPath } from "@/lib/merchants/auth-results";
import { resolveMemberAuthDestination } from "@/lib/members/member-consents";
import { queueMemberWelcome } from "@/lib/shop/newcomer-welcome";

/**
 * Pick the appropriate sanitizer based on the requested `next` path. Member
 * redirects go through the member sanitizer; merchant redirects go through
 * the merchant sanitizer. The sanitizers themselves reject any target that
 * isn't on their own allow-list, so even if a malicious callback tries to
 * route a merchant sign-in to `/admin` or a member sign-in to `/merchant`,
 * the redirect is forced back onto the originating surface.
 */
function sanitizeNextForPath(rawNext: string | null): string {
  const value = rawNext ?? "";
  if (value.startsWith("/merchant")) {
    return sanitizeMerchantNextPath(value);
  }
  return sanitizeMemberNextPath(value);
}

function redirectWithinSite(path: string) {
  // Keep redirects on the browser's origin, even behind a container proxy.
  return new Response(null, {
    status: 307,
    headers: { Location: path, "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = sanitizeNextForPath(requestUrl.searchParams.get("next"));

  if (!code) {
    return redirectWithinSite(next.startsWith("/merchant") ? "/merchant?error=callback" : "/member?error=callback");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return redirectWithinSite(next.startsWith("/merchant") ? "/merchant?error=callback" : "/member?error=callback");
  }

  if (next.startsWith("/merchant")) {
    return redirectWithinSite(next);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return redirectWithinSite("/member?error=callback");
  }

  const destination = await resolveMemberAuthDestination(user, next, supabase);
  if (user.email_confirmed_at) await queueMemberWelcome(destination);
  return redirectWithinSite(destination);
}
