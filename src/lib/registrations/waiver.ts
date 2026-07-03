/**
 * Waiver utility functions.
 * Server-side only — never expose computeWaiverSha to the browser.
 */

/**
 * Compute the SHA-256 hash of waiver legal text.
 * Server-side only — never accept a client-supplied hash.
 */
export async function computeWaiverSha(legalText: string): Promise<string> {
  const data = new TextEncoder().encode(legalText);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
