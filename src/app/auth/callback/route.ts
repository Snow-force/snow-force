import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeMemberNextPath } from "@/lib/members/auth-results";
import { sanitizeMerchantNextPath } from "@/lib/merchants/auth-results";

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

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = sanitizeNextForPath(requestUrl.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(
      new URL(next.startsWith("/merchant") ? "/merchant?error=callback" : "/member?error=callback", requestUrl.origin),
    );
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(next.startsWith("/merchant") ? "/merchant?error=callback" : "/member?error=callback", requestUrl.origin),
    );
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
