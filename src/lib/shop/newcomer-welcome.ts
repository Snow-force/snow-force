import "server-only";

/** Queue the verified account's requested benefit independently of client rendering.
 * Welcome delivery is best-effort and must never prevent sign-in or verification. */
export async function queueMemberWelcome(destination: string) {
  if (destination.startsWith("/merchant") || destination.startsWith("/member/consent") || (process.env.NEWCOMER_SIGNING_SECRET?.length ?? 0) < 32) return;
  try {
    const { getNewcomerPolicy } = await import("./newcomer");
    if (!await getNewcomerPolicy()) return;
    const { claimNewcomerAction } = await import("./newcomer-actions");
    const result = await claimNewcomerAction();
    if (result.status === "unavailable") console.error("[member.welcome] Welcome benefit could not be queued; member access remains available.");
  } catch { console.error("[member.welcome] Welcome benefit could not be queued; member access remains available."); }
}
