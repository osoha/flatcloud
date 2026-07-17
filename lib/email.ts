import nodemailer from "nodemailer";
import { appSettings } from "./settings";
import { openSecret } from "./secret";

export type MailInput = { to: string; subject: string; html: string; text: string; attachments?: Array<{ filename: string; content: Buffer; cid?: string; contentType?: string }> };

export async function smtpConfiguration() {
  const settings = await appSettings();
  const host = settings.smtpHost || process.env.SMTP_HOST || "";
  const port = settings.smtpPort || Number(process.env.SMTP_PORT || 587);
  const secure = settings.smtpHost ? settings.smtpSecure : String(process.env.SMTP_SECURE || "false").toLowerCase() === "true" || port === 465;
  const user = settings.smtpUser || process.env.SMTP_USER || "";
  const password = settings.smtpPasswordEncrypted ? openSecret(settings.smtpPasswordEncrypted) || "" : process.env.SMTP_PASSWORD || "";
  const fromName = settings.smtpFromName || process.env.SMTP_FROM_NAME || "FlatCloud";
  const fromEmail = settings.smtpFromEmail || process.env.SMTP_FROM_EMAIL || "";
  const replyTo = settings.smtpReplyTo || undefined;
  return { host, port, secure, user, password, fromName, fromEmail, replyTo, configured: Boolean(host && user && password && fromEmail) };
}

export async function sendMail(input: MailInput) {
  const config = await smtpConfiguration();
  if (!config.configured) return { sent: false as const, reason: "SMTP není nakonfigurováno." };
  const transporter = nodemailer.createTransport({ host: config.host, port: config.port, secure: config.secure, auth: { user: config.user, pass: config.password }, requireTLS: !config.secure });
  const result = await transporter.sendMail({ from: `"${escapeHeader(config.fromName)}" <${config.fromEmail}>`, replyTo: config.replyTo, ...input });
  return { sent: true as const, messageId: result.messageId };
}

export async function sendInvitationEmail(input: { to: string; inviterName: string; propertyName: string; permissionLabel: string; inviteUrl: string }) {
  return sendMail({
    to: input.to,
    subject: `Pozvánka do FlatCloud Rent – ${input.propertyName}`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#17233a;max-width:620px;margin:auto"><div style="padding:18px 0;border-bottom:1px solid #dbe4f0"><strong style="font-size:22px;color:#1766b1">FlatCloud</strong></div><h2>Pozvánka do FlatCloud Rent</h2><p>${escapeHtml(input.inviterName)} vás pozval ke správě nemovitosti <strong>${escapeHtml(input.propertyName)}</strong>.</p><p>Oprávnění: <strong>${escapeHtml(input.permissionLabel)}</strong>.</p><p><a href="${escapeHtml(input.inviteUrl)}" style="display:inline-block;background:#1766b1;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px">Přijmout pozvánku</a></p><p style="color:#64748b">Odkaz je platný 7 dní. Pokud jste pozvánku neočekávali, e-mail můžete ignorovat.</p></div>`,
    text: `${input.inviterName} vás pozval do FlatCloud Rent k nemovitosti ${input.propertyName}. Oprávnění: ${input.permissionLabel}. Přijmout: ${input.inviteUrl}`,
  });
}

export function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character); }
function escapeHeader(value: string) { return value.replace(/[\r\n"]/g, ""); }
