import nodemailer from "nodemailer";
import { communicationDesign, renderCommunicationFrame } from "./communication-design";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { appSettings } from "./settings";
import { openSecret } from "./secret";

export type MailInput = { to: string; subject: string; html: string; text: string; attachments?: Array<{ filename: string; content: Buffer; cid?: string; contentType?: string }> };
const logoCid = "flatberry-brand-logo@flatberry";
const logoPath = communicationDesign.logo;

/** The same frame is used in live messages and in the welcome-letter preview. */
export const renderFlatBerryEmail = renderCommunicationFrame;

export async function prepareFlatBerryMail(input: MailInput): Promise<MailInput> {
  const html = (input.html.includes('data-flatberry-email="1"') ? input.html : renderFlatBerryEmail(input.html))
    .replaceAll(`src="${logoPath}"`, `src="cid:${logoCid}"`);
  // Embed the brand asset; rendering still depends on the recipient's mail client.
  const logo = await readFile(join(process.cwd(), "public", "flatberry-document-logo.png"));
  return { ...input, html, attachments: [...(input.attachments || []), { filename: "flatberry-logo.png", content: logo, cid: logoCid, contentType: "image/png" }] };
}

export async function smtpConfiguration() {
  const settings = await appSettings();
  const host = settings.smtpHost || process.env.SMTP_HOST || "";
  const port = settings.smtpPort || Number(process.env.SMTP_PORT || 587);
  const secure = settings.smtpHost ? settings.smtpSecure : String(process.env.SMTP_SECURE || "false").toLowerCase() === "true" || port === 465;
  const user = settings.smtpUser || process.env.SMTP_USER || "";
  let password = process.env.SMTP_PASSWORD || "";
  if (settings.smtpPasswordEncrypted) {
    try {
      password = openSecret(settings.smtpPasswordEncrypted) || password;
    } catch (error) {
      // Pokud je na cron jobu dostupné SMTP_PASSWORD z Renderu, může bezpečně posloužit jako fallback.
      if (!password) throw error;
      console.warn(`[smtp] Uložené SMTP heslo se nepodařilo dešifrovat; používám SMTP_PASSWORD z prostředí. ${error instanceof Error ? error.message : ""}`);
    }
  }
  const configuredFromName = settings.smtpFromName || process.env.SMTP_FROM_NAME || "FlatBerry";
  const fromName = ["FlatCloud", "FlatCloud Rent"].includes(configuredFromName.trim()) ? "FlatBerry" : configuredFromName;
  const fromEmail = settings.smtpFromEmail || process.env.SMTP_FROM_EMAIL || "";
  const replyTo = settings.smtpReplyTo || undefined;
  return { host, port, secure, user, password, fromName, fromEmail, replyTo, configured: Boolean(host && user && password && fromEmail) };
}

export async function sendMail(input: MailInput) {
  const config = await smtpConfiguration();
  if (!config.configured) return { sent: false as const, reason: "SMTP není nakonfigurováno." };
  const branded = await prepareFlatBerryMail(input);
  const transporter = nodemailer.createTransport({ host: config.host, port: config.port, secure: config.secure, auth: { user: config.user, pass: config.password }, requireTLS: !config.secure });
  const result = await transporter.sendMail({ from: `"${escapeHeader(config.fromName)}" <${config.fromEmail}>`, replyTo: config.replyTo, ...branded });
  return { sent: true as const, messageId: result.messageId };
}

export async function sendInvitationEmail(input: { to: string; inviterName: string; propertyName: string; permissionLabel: string; inviteUrl: string }) {
  const loginUrl = new URL("/login", input.inviteUrl).toString();
  const homeUrl = new URL("/", input.inviteUrl).toString();
  return sendMail({
    to: input.to,
    subject: `Pozvánka do FlatBerry – ${input.propertyName}`,
    html: `<h2 style="margin:0 0 14px;color:#102348">Pozvánka do FlatBerry</h2><p>${escapeHtml(input.inviterName)} vás pozval ke správě nemovitosti <strong>${escapeHtml(input.propertyName)}</strong>.</p><p>Oprávnění: <strong>${escapeHtml(input.permissionLabel)}</strong>.</p><p><a href="${escapeHtml(input.inviteUrl)}" style="display:inline-block;background:#2465e8;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px">Přijmout pozvánku</a></p><p style="color:#64748b">Odkaz je platný 7 dní. Pokud jste pozvánku neočekávali, e-mail můžete ignorovat.</p>`,
    text: `${input.inviterName} vás pozval do FlatBerry k nemovitosti ${input.propertyName}. Oprávnění: ${input.permissionLabel}. Přijmout: ${input.inviteUrl}`,
  });
}

export async function sendTenantPortalInvitationEmail(input:{to:string;inviterName:string;inviteUrl:string}) {
  return sendMail({to:input.to,subject:"Pozvánka do Portálu nájemníka FlatBerry",
    html:`<h2>Pozvánka do Portálu nájemníka</h2><p>${escapeHtml(input.inviterName)} vás pozval do portálu FlatBerry pro váš nájem.</p><p><a href="${escapeHtml(input.inviteUrl)}">Přijmout pozvánku</a></p><p>Odkaz platí 7 dní. Pokud jste pozvánku neočekávali, ignorujte ji.</p>`,
    text:`${input.inviterName} vás pozval do Portálu nájemníka FlatBerry. Přijmout pozvánku: ${input.inviteUrl}`});
}

export function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character); }
function escapeHeader(value: string) { return value.replace(/[\r\n"]/g, ""); }
