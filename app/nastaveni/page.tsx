import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { appSettings } from "@/lib/settings";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";

export const dynamic = "force-dynamic";
const variables = "{{property}}, {{unit}}, {{tenant}}, {{period}}, {{dueDate}}, {{oldestDueDate}}, {{amount}}, {{outstanding}}, {{iban}}, {{variableSymbol}}, {{owner}}";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") redirect("/portfolio");
  const [settings, query] = await Promise.all([appSettings(), searchParams]);
  const mailboxReady = Boolean(settings.inboundMailEnabled && settings.inboundMailHost && settings.inboundMailUser && settings.inboundMailPasswordEncrypted);

  return <Shell user={user}><div className="page v21-admin-page">
    <div className="page-title"><div><h1>Administrace aplikace</h1><p>Centrální sběr bankovních e-mailů, automatické párování plateb a komunikace k nájmu.</p></div></div>
    <Flash ok={query.ok} error={query.error}/>

    <div className="detail-grid">
      <form className="card col-8 edit-form featured-settings-card" action="/api/settings/inbound-mail" method="post">
        <div className="card-head"><div><div className="eyebrow"><Mail size={14}/> Platební automatizace</div><h2>Sběrný e-mail bankovních notifikací</h2><p className="muted-copy">FlatCloud nepotřebuje přímé API napojení banky. Jednotlivé účty se propojí nastavením e-mailových notifikací o příchozích platbách.</p></div><span className={`connection-badge ${mailboxReady?"ok":"warn"}`}>{mailboxReady?"Nastavení uloženo":"Vyžaduje nastavení"}</span></div>
        <div className="form-grid">
          <label className="checkbox-field field-full"><input type="checkbox" name="inboundMailEnabled" defaultChecked={settings.inboundMailEnabled}/><span>Automatický sběr bankovních e-mailů je aktivní</span></label>
          <label className="field"><span>IMAP server</span><input name="inboundMailHost" placeholder="imap.vase-domena.cz" defaultValue={settings.inboundMailHost||""}/></label>
          <label className="field"><span>Port</span><input type="number" name="inboundMailPort" min={1} max={65535} defaultValue={settings.inboundMailPort||993}/></label>
          <label className="field"><span>Sběrný e-mail / uživatel</span><input name="inboundMailUser" placeholder="platby@vase-domena.cz" defaultValue={settings.inboundMailUser||""}/></label>
          <label className="field"><span>Heslo</span><input type="password" name="inboundMailPassword" autoComplete="new-password" placeholder={settings.inboundMailPasswordEncrypted?"Nastaveno – vyplňte jen při změně":""}/></label>
          <label className="field"><span>Složka</span><input name="inboundMailMailbox" defaultValue={settings.inboundMailMailbox||"INBOX"}/></label>
          <label className="checkbox-field"><input type="checkbox" name="inboundMailSecure" defaultChecked={settings.inboundMailSecure}/><span>TLS / SSL (doporučeno, obvykle port 993)</span></label>
        </div>
        <div className="form-actions"><button className="primary" type="submit">Uložit sběrný e-mail</button></div>
      </form>

      <div className="card col-4 settings-status-card">
        <div className="card-head"><div><h2>Stav příjmu plateb</h2><p className="muted-copy">Poslední známý stav centrální schránky.</p></div><ShieldCheck size={20}/></div>
        <div className="summary-list"><div><span>Poslední kontrola</span><strong>{settings.inboundMailLastCheckedAt?.toLocaleString("cs-CZ")||"Zatím neběhla"}</strong></div><div><span>Poslední UID</span><strong>{settings.inboundMailLastUid||0}</strong></div><div><span>Výsledek</span><strong>{settings.inboundMailLastSummary||"—"}</strong></div></div>
        <div className="stack-actions" style={{marginTop:16}}><form action="/api/settings/inbound-mail/test" method="post"><button className="primary full-button" type="submit"><ShieldCheck size={14}/> Otestovat IMAP připojení</button></form><form action="/api/settings/inbound-mail/run" method="post"><button className="secondary full-button" type="submit"><RefreshCw size={14}/> Zkontrolovat schránku nyní</button></form><Link className="secondary full-button" href="/platby/nesparovane">Otevřít nespárované platby</Link></div>
      </div>
    </div>

    <div className="card bank-guide-card" style={{marginTop:20}}>
      <div className="card-head"><div><h2>Jak propojit bankovní účet s FlatCloudem</h2><p className="muted-copy">Centrální schránka se nastavuje jednou zde. Každý účet se potom ověřuje přímo u konkrétní nemovitosti.</p></div></div>
      <div className="guide-steps">
        <GuideStep n="1" title="Uložte sběrnou schránku" text="Použijte samostatný e-mail pouze pro bankovní notifikace a bezpečný IMAP přístup."/>
        <GuideStep n="2" title="U nemovitosti otevřete Banka a pravidla" text="FlatCloud zobrazí účet pro nájemné, sběrný e-mail a unikátní testovací variabilní symbol."/>
        <GuideStep n="3" title="V bance zapněte e-mailové notifikace" text="Pro příchozí pohyby nastavte zasílání na sběrný e-mail. Nefiltrujte pouze jeden VS."/>
        <GuideStep n="4" title="Odešlete testovací 1 Kč" text="Po přijetí testovací notifikace FlatCloud účet označí jako ověřený a dál automaticky zpracovává platby."/>
      </div>
      <div className="notice success-notice"><CheckCircle2 size={16}/> Nejednoznačné nebo nerozpoznané platby se nikdy automaticky neztratí – zůstanou ve frontě nespárovaných plateb k ruční kontrole.</div>
    </div>

    <form className="card edit-form" action="/api/settings/notifications" method="post" style={{marginTop:20}}>
      <div className="card-head"><div><h2>SMTP a automatická komunikace k nájmu</h2><p className="muted-copy">Platební informace, upomínky a interní eskalace. Upomínkové případy se zároveň zapisují do Úkolů a vytvářejí komunikační vlákno pro správce a vlastníka.</p></div></div>
      <div className="form-grid">
        <label className="field"><span>SMTP server</span><input name="smtpHost" defaultValue={settings.smtpHost||process.env.SMTP_HOST||""}/></label><label className="field"><span>Port</span><input type="number" name="smtpPort" min={1} max={65535} defaultValue={settings.smtpPort||587}/></label><label className="field"><span>Uživatel</span><input name="smtpUser" defaultValue={settings.smtpUser||process.env.SMTP_USER||""}/></label><label className="field"><span>Heslo</span><input type="password" name="smtpPassword" placeholder={settings.smtpPasswordEncrypted||process.env.SMTP_PASSWORD?"Nastaveno – vyplňte jen při změně":""}/></label><label className="field"><span>Jméno odesílatele</span><input name="smtpFromName" defaultValue={settings.smtpFromName||process.env.SMTP_FROM_NAME||"FlatCloud"}/></label><label className="field"><span>E-mail odesílatele</span><input type="email" name="smtpFromEmail" defaultValue={settings.smtpFromEmail||process.env.SMTP_FROM_EMAIL||""}/></label><label className="field"><span>Reply-To</span><input type="email" name="smtpReplyTo" defaultValue={settings.smtpReplyTo||""}/></label><label className="checkbox-field"><input type="checkbox" name="smtpSecure" defaultChecked={settings.smtpSecure}/><span>Přímé TLS (obvykle port 465)</span></label>
        <label className="checkbox-field field-full"><input type="checkbox" name="remindersEnabled" defaultChecked={settings.remindersEnabled}/><span>Automatické platební zprávy a upomínky jsou aktivní</span></label><label className="field"><span>Hodina odesílání (Praha)</span><input type="number" name="reminderSendHour" min={0} max={23} defaultValue={settings.reminderSendHour}/></label><label className="field"><span>Platební údaje před splatností</span><input type="number" name="paymentNoticeDaysBefore" min={0} max={31} defaultValue={settings.paymentNoticeDaysBefore}/><small>dní před splatností</small></label><label className="field"><span>První upozornění</span><input type="number" name="firstReminderDaysAfter" min={1} max={90} defaultValue={settings.firstReminderDaysAfter}/><small>dní po splatnosti</small></label><label className="field"><span>Druhá upomínka</span><input type="number" name="secondReminderDaysAfter" min={1} max={180} defaultValue={settings.secondReminderDaysAfter}/><small>dní po splatnosti</small></label><label className="field"><span>Interní upozornění správci</span><input type="number" name="managerAlertDaysAfter" min={1} max={365} defaultValue={settings.managerAlertDaysAfter}/><small>dní po splatnosti</small></label><label className="field"><span>Ruční eskalace</span><input type="number" name="escalationDaysAfter" min={1} max={365} defaultValue={settings.escalationDaysAfter}/><small>dní po splatnosti</small></label>
        <div className="field field-full"><span>Dostupné proměnné šablon</span><div className="notice">{variables}</div></div><label className="field field-full"><span>Předmět platebních údajů</span><input name="paymentNoticeSubject" defaultValue={settings.paymentNoticeSubject} required/></label><label className="field field-full"><span>Text platebních údajů</span><textarea name="paymentNoticeBody" defaultValue={settings.paymentNoticeBody} rows={7} required/></label><label className="field field-full"><span>Předmět prvního upozornění</span><input name="firstReminderSubject" defaultValue={settings.firstReminderSubject} required/></label><label className="field field-full"><span>Text prvního upozornění</span><textarea name="firstReminderBody" defaultValue={settings.firstReminderBody} rows={7} required/></label><label className="field field-full"><span>Předmět druhé upomínky</span><input name="secondReminderSubject" defaultValue={settings.secondReminderSubject} required/></label><label className="field field-full"><span>Text druhé upomínky</span><textarea name="secondReminderBody" defaultValue={settings.secondReminderBody} rows={7} required/></label>
      </div>
      <div className="form-actions"><button className="primary" type="submit">Uložit SMTP a upomínky</button></div>
    </form>

    <div className="detail-grid" style={{marginTop:20}}><div className="card col-7"><h2>Stav upomínkového plánovače</h2><div className="summary-list"><div><span>Poslední start</span><strong>{settings.lastReminderCronStartedAt?.toLocaleString("cs-CZ")||"Zatím neběžel"}</strong></div><div><span>Poslední dokončení</span><strong>{settings.lastReminderCronFinishedAt?.toLocaleString("cs-CZ")||"—"}</strong></div><div><span>Výsledek</span><strong>{settings.lastReminderCronSummary||"—"}</strong></div></div><div className="notice" style={{marginTop:16}}>Každá automatická upomínka doplní provozní případ v Úkolech. Vlastník tak vidí stav řešení bez ručního zjišťování u správce.</div></div><div className="card col-5"><h2>Kontrola komunikace</h2><div className="stack-actions"><form action="/api/settings/notifications/test" method="post"><button className="secondary" type="submit">Odeslat test SMTP na můj e-mail</button></form><form action="/api/settings/notifications/run" method="post"><button className="secondary" type="submit">Spustit kontrolu upomínek nyní</button></form><Link className="secondary" href="/nastaveni/upominky/vynutit">Vynutit rozeslání mimo kalendář</Link></div></div></div>
  </div></Shell>;
}

function GuideStep({n,title,text}:{n:string;title:string;text:string}) { return <div className="guide-step"><span>{n}</span><div><strong>{title}</strong><p>{text}</p></div></div>; }
