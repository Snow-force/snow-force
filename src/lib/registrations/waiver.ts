/**
 * Waiver utility functions and constants.
 * Server-side only — never expose computeWaiverSha to the browser.
 */

/**
 * Default English liability waiver text for SnowForce events.
 * Admins can edit this per-event in the admin editor.
 * Only the legal terms are included here — participant info fields
 * (name, email, phone, emergency contact) are collected via the
 * registration form questions.
 */
export const DEFAULT_WAIVER_TEXT = `SnowForce Club Activity Waiver & Release of Liability

1. Voluntary Participation
I understand that participation in snowboarding, butter clinic, balance training, flatground riding, and related physical activities is voluntary and involves inherent risks.
I choose to participate willingly and accept full responsibility for my participation.

2. Assumption of Risk
I understand that activities may involve risks, including but not limited to:
• Falls, slips, collisions, or loss of balance
• Muscle strains, sprains, fractures, or other injuries
• Equipment malfunction or misuse
• Weather, terrain, or surface-related hazards
• Actions of other participants
I knowingly assume all risks associated with participation.

3. Health & Physical Condition
I confirm that:
• I am physically fit to participate
• I have disclosed any injuries, medical conditions, pregnancy, or limitations that may affect my participation
• I understand SnowForce instructors are not medical professionals

4. Protective Gear Responsibility
I understand that protective gear (including helmets, pads, impact shorts, etc.) may be recommended but not guaranteed to prevent injury.
I am responsible for choosing whether to wear protective equipment.

5. Release of Liability
I release and hold harmless SnowForce, its owners, instructors, coaches, staff, volunteers, sponsors, venue partners, and affiliated brands from any claims, liabilities, injuries, damages, or losses arising from my participation.
This includes negligence to the fullest extent permitted by law.

6. Personal Property
SnowForce is not responsible for lost, stolen, or damaged personal belongings during the Event.

7. Media Release
I understand that photos and videos may be taken during the Event and may be used for marketing, social media, promotional materials, and website content.
I grant SnowForce permission to use my image without compensation.

8. Refund Policy
All bookings are non-refundable unless the event is canceled by SnowForce Club.
If canceled, participants may receive either a credit toward a future event or a rescheduled date.

9. Minor Participants
If registering on behalf of a minor, I confirm that I am the parent/legal guardian and agree to this waiver on their behalf.

Questions / Customer Support
For any questions regarding your booking, waiver, or event details, please contact us:
Email: hello@snow-force.com
Instagram: @snowforceclub
We generally respond within 1–2 business days.

Agreement
By completing my booking, I confirm that:
✓ I have read and agree to this waiver
✓ I understand the risks involved
✓ I voluntarily participate in SnowForce activities
✓ I release SnowForce, its instructors, staff, sponsors, and partners from liability as described above`;

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
