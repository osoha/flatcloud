import nodemailer from "nodemailer";

export function emailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.SMTP_FROM_EMAIL);
}

function smtpTransport() {
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true" || port === 465;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
    requireTLS: !secure,
  });
}

export async function sendInvitationEmail(input: { to: string; inviterName: string; propertyName: string; permissionLabel: string; inviteUrl: string }) {
  if (!emailConfigured()) return { sent: false as const, reason: "SMTP není nakonfigurováno." };
  const fromName = process.env.SMTP_FROM_NAME || "FlatCloud";
  const fromEmail = process.env.SMTP_FROM_EMAIL!;
  const transporter = smtpTransport();
  await transporter.sendMail({
    from: `"${escapeHeader(fromName)}" <${fromEmail}>`,
    to: input.to,
    subject: `Pozvánka do FlatCloud Rent – ${input.propertyName}`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#17233a;max-width:620px;margin:auto"><div style="padding:18px 0;border-bottom:1px solid #dbe4f0"><strong style="font-size:22px;color:#1766b1">FlatCloud</strong></div><h2>Pozvánka do FlatCloud Rent</h2><p>${escapeHtml(input.inviterName)} vás pozval ke správě nemovitosti <strong>${escapeHtml(input.propertyName)}</strong>.</p><p>Oprávnění: <strong>${escapeHtml(input.permissionLabel)}</strong>.</p><p><a href="${escapeHtml(input.inviteUrl)}" style="display:inline-block;background:#1766b1;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px">Přijmout pozvánku</a></p><p style="color:#64748b">Odkaz je platný 7 dní. Pokud jste pozvánku neočekávali, e-mail můžete ignorovat.</p></div>`,
    text: `${input.inviterName} vás pozval do FlatCloud Rent k nemovitosti ${input.propertyName}. Oprávnění: ${input.permissionLabel}. Přijmout: ${input.inviteUrl}`,
  });
  return { sent: true as const };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character);
}
function escapeHeader(value: string) {
  return value.replace(/[\r\n"]/g, "");
}
