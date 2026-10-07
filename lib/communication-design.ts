/** Identity shared by operational emails and newly issued official documents. */
export const communicationDesign = {
  ink: "#13233e", blue: "#2168f5", muted: "#586a83", line: "#dce5f1",
  pale: "#edf4ff", background: "#f3f6fb", logo: "/flatberry-document-logo.png",
} as const;

export function escapeCommunicationText(value: string) {
  return value.replace(/[&<>'"]/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;"})[c]!);
}

/** All variable values are text, including URLs. Only the frame accepts trusted template HTML. */
export function notificationEmailContent(input: {
  category: string; title: string; message: string;
  action?: {label: string; url: string}; footer?: string; attachmentLabel?: string;
}) {
  const e = escapeCommunicationText, c = communicationDesign;
  let action = "";
  if (input.action) {
    const url = new URL(input.action.url);
    if (!["https:", "http:"].includes(url.protocol)) throw new Error("Unsupported notification URL");
    action = `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0"><tr><td bgcolor="${c.blue}" style="border-radius:8px"><a href="${e(input.action.url)}" style="display:inline-block;padding:13px 20px;font-weight:bold;color:#fff;text-decoration:none">${e(input.action.label)}</a></td></tr></table>`;
  }
  return `<p style="margin:0 0 10px;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${c.muted}">${e(input.category)}</p><h1 style="margin:0 0 18px;font-size:25px;line-height:1.25;color:${c.ink};overflow-wrap:anywhere">${e(input.title)}</h1><p style="margin:0 0 18px;white-space:normal;overflow-wrap:anywhere">${e(input.message).replace(/\n/g,"<br>")}</p>${input.attachmentLabel ? `<p style="padding:14px 16px;background:${c.pale};border-radius:8px;color:${c.ink}"><strong>Dokument v příloze</strong><br>${e(input.attachmentLabel)}</p>` : ""}${action}${input.footer ? `<p style="margin:22px 0 0;font-size:12px;color:${c.muted}">${e(input.footer)}</p>` : ""}`;
}

export function renderCommunicationFrame(content: string) {
  const c = communicationDesign;
  return `<div data-flatberry-email="1" style="margin:0;padding:24px 10px;background:${c.background};font-family:Arial,Helvetica,sans-serif;font-size:15px;color:${c.ink};line-height:1.55"><table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="width:100%;max-width:620px;margin:auto;background:#fff;border:1px solid ${c.line};border-radius:12px;table-layout:fixed"><tr><td style="padding:25px 24px 22px;border-bottom:1px solid ${c.line}"><img src="${c.logo}" width="140" alt="FlatBerry" style="display:block;width:140px;height:auto;max-width:100%;border:0"></td></tr><tr><td style="padding:28px 24px;overflow-wrap:anywhere;word-break:break-word">${content}</td></tr><tr><td style="padding:16px 24px;border-top:1px solid ${c.line};color:${c.muted};font-size:11px">Zpráva byla vytvořena v aplikaci FlatBerry.</td></tr></table></div>`;
}

export function rentEmailContent(input: {
  title: string; body: string; qrSource?: string;
  owner: {name: string; ico: string | null; address: string | null; email: string | null; phone: string | null};
  payment?: {amount: string; iban: string; variableSymbol: string; dueDate: string; overdue: boolean};
}) {
  const e = escapeCommunicationText, c = communicationDesign, p = input.payment, owner = input.owner;
  const summary = p ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 22px;background:${c.pale};border-radius:8px;table-layout:fixed"><tr><td style="padding:18px"><span style="font-size:11px;text-transform:uppercase;color:${c.muted}">${p.overdue ? "Zbývá uhradit" : "K úhradě"}</span><br><strong style="font-size:28px;line-height:1.5;color:${c.blue}">${e(p.amount)}</strong><br><span style="font-size:13px">${p.overdue ? "Nejstarší splatnost" : "Splatnost"}: ${e(p.dueDate)}<br>Účet (IBAN): <strong style="overflow-wrap:anywhere;word-break:break-all">${e(p.iban)}</strong><br>Variabilní symbol: <strong>${e(p.variableSymbol)}</strong></span></td></tr></table>` : "";
  return `<p style="margin:0 0 10px;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${c.muted}">${p?.overdue ? "Připomenutí platby" : "Platební údaje"}</p><h1 style="margin:0 0 20px;font-size:25px;line-height:1.25;color:${c.ink}">${e(input.title)}</h1>${summary}<div style="overflow-wrap:anywhere">${e(input.body).replace(/\n/g,"<br>")}</div>${input.qrSource ? `<div style="margin:24px 0"><p style="margin:0 0 10px;font-weight:bold">QR platba</p><img src="${e(input.qrSource)}" width="180" height="180" alt="QR kód pro platbu" style="display:block;width:180px;height:180px;max-width:100%;border:0"><p style="font-size:12px;color:${c.muted}">Před odesláním platby zkontrolujte částku a platební údaje.</p></div>` : ""}<div style="margin-top:24px;padding-top:18px;border-top:1px solid ${c.line};font-size:12px;color:${c.muted}">Vlastník / příjemce platby<br><strong style="font-size:14px;color:${c.ink}">${e(owner.name)}</strong>${owner.ico ? `<br>IČO: ${e(owner.ico)}` : ""}${owner.address ? `<br>${e(owner.address)}` : ""}<br>${[owner.email,owner.phone].filter(Boolean).map(v=>e(v!)).join(" · ")}</div>`;
}
