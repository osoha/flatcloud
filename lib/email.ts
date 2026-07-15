export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.INVITE_FROM_EMAIL);
}

export async function sendInvitationEmail(input: { to: string; inviterName: string; propertyName: string; permissionLabel: string; inviteUrl: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.INVITE_FROM_EMAIL;
  if (!apiKey || !from) return { sent: false as const, reason: "E-mailová služba není nakonfigurována." };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: `Pozvánka do FlatCloud Rent – ${input.propertyName}`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#17233a"><h2>Pozvánka do FlatCloud Rent</h2><p>${escapeHtml(input.inviterName)} vás pozval ke správě nemovitosti <strong>${escapeHtml(input.propertyName)}</strong>.</p><p>Oprávnění: <strong>${escapeHtml(input.permissionLabel)}</strong>.</p><p><a href="${escapeHtml(input.inviteUrl)}" style="display:inline-block;background:#2f63ee;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px">Přijmout pozvánku</a></p><p>Odkaz je platný 7 dní. Pokud jste pozvánku neočekávali, e-mail můžete ignorovat.</p></div>`,
      text: `${input.inviterName} vás pozval do FlatCloud Rent k nemovitosti ${input.propertyName}. Oprávnění: ${input.permissionLabel}. Přijmout: ${input.inviteUrl}`,
    }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Odeslání pozvánky selhalo (${response.status}): ${body.slice(0, 300)}`);
  return { sent: true as const };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character);
}
