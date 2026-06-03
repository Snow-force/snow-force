export type EmailPayload = {
  to: string;
  subject: string;
  html: string;
};

export async function sendEmail(payload: EmailPayload): Promise<{ success: boolean; error?: string }> {
  try {
    // In production, integrate with SendGrid, Resend, or Supabase email.
    // For now, log to console so the app is runnable without credentials.
    console.log("[EMAIL] Would send:", payload.to, payload.subject);
    return { success: true };
  } catch (e) {
    console.error("[EMAIL] Failed:", e);
    return { success: false, error: String(e) };
  }
}

export function buildConfirmationEmail(
  to: string,
  eventTitle: string,
  eventDate: string,
  lang: "en" | "zh",
): EmailPayload {
  const isEn = lang === "en";
  return {
    to,
    subject: isEn
      ? `Registration Confirmed — ${eventTitle}`
      : `报名确认 — ${eventTitle}`,
    html: isEn
      ? `<h2>You're registered!</h2><p>You're confirmed for <strong>${eventTitle}</strong> on ${eventDate}.</p><p>We'll send more details closer to the event date.</p>`
      : `<h2>报名成功！</h2><p>你已确认参加 <strong>${eventTitle}</strong>，活动日期：${eventDate}。</p><p>活动临近时我们会发送更多详情。</p>`,
  };
}

export function buildRegistrationVerificationEmail(
  to: string,
  eventTitle: string,
  confirmationUrl: string,
  lang: "en" | "zh",
): EmailPayload {
  const isEn = lang === "en";
  return {
    to,
    subject: isEn
      ? `Confirm your SnowForce registration - ${eventTitle}`
      : `确认你的 SnowForce 报名 - ${eventTitle}`,
    html: isEn
      ? `<h2>Confirm your registration</h2><p>Click the link below to confirm your registration for <strong>${eventTitle}</strong>.</p><p><a href="${confirmationUrl}">Confirm registration</a></p><p>This link expires in 24 hours.</p>`
      : `<h2>确认报名</h2><p>点击下方链接确认报名 <strong>${eventTitle}</strong>。</p><p><a href="${confirmationUrl}">确认报名</a></p><p>此链接将在 24 小时后失效。</p>`,
  };
}

export function buildStaffNotificationEmail(
  eventTitle: string,
  registrantName: string,
): EmailPayload {
  return {
    to: "staff@snowforce.example.com",
    subject: `New Registration — ${eventTitle}`,
    html: `<p>${registrantName} just registered for <strong>${eventTitle}</strong>.</p><p>Check the admin panel for details.</p>`,
  };
}
