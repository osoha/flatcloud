import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { audit } from "@/lib/management";
import { intValue, text } from "@/lib/forms";
import { go, goWithMessage } from "@/lib/route-response";
import { sealSecret } from "@/lib/secret";

function bounded(form: FormData, name: string, fallback: number, min: number, max: number) { return Math.min(max, Math.max(min, intValue(form, name, fallback))); }
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user || user.role !== "SUPER_ADMIN") return go(request, "/login");
  try {
    const form = await request.formData();
    const smtpPassword = text(form, "smtpPassword");
    const data = {
      smtpHost: text(form, "smtpHost"), smtpPort: bounded(form, "smtpPort", 587, 1, 65535), smtpSecure: form.get("smtpSecure") === "on",
      smtpUser: text(form, "smtpUser"), smtpFromName: text(form, "smtpFromName"), smtpFromEmail: text(form, "smtpFromEmail"), smtpReplyTo: text(form, "smtpReplyTo"),
      remindersEnabled: form.get("remindersEnabled") === "on", reminderSendHour: bounded(form, "reminderSendHour", 8, 0, 23),
      paymentNoticeDaysBefore: bounded(form, "paymentNoticeDaysBefore", 5, 0, 31), firstReminderDaysAfter: bounded(form, "firstReminderDaysAfter", 3, 1, 90), secondReminderDaysAfter: bounded(form, "secondReminderDaysAfter", 10, 1, 180), managerAlertDaysAfter: bounded(form, "managerAlertDaysAfter", 20, 1, 365), escalationDaysAfter: bounded(form, "escalationDaysAfter", 30, 1, 365),
      paymentNoticeSubject: text(form, "paymentNoticeSubject", true)!, paymentNoticeBody: text(form, "paymentNoticeBody", true)!, firstReminderSubject: text(form, "firstReminderSubject", true)!, firstReminderBody: text(form, "firstReminderBody", true)!, secondReminderSubject: text(form, "secondReminderSubject", true)!, secondReminderBody: text(form, "secondReminderBody", true)!,
      ...(smtpPassword ? { smtpPasswordEncrypted: sealSecret(smtpPassword) } : {}),
    };
    if (data.secondReminderDaysAfter <= data.firstReminderDaysAfter) throw new Error("Druhá upomínka musí následovat po první upomínce.");
    if (data.managerAlertDaysAfter <= data.secondReminderDaysAfter) throw new Error("Interní upozornění správci musí následovat po druhé upomínce.");
    if (data.escalationDaysAfter <= data.managerAlertDaysAfter) throw new Error("Eskalace musí následovat po interním upozornění správci.");
    await prisma.appSetting.upsert({ where: { id: "global" }, update: data, create: { id: "global", ...data } });
    await audit(user.id, "RENT_NOTIFICATION_SETTINGS_UPDATED", "AppSetting", "global", { remindersEnabled: data.remindersEnabled, deadlines: [data.paymentNoticeDaysBefore, data.firstReminderDaysAfter, data.secondReminderDaysAfter, data.managerAlertDaysAfter, data.escalationDaysAfter], smtpPasswordChanged: Boolean(smtpPassword) });
    return goWithMessage(request, "/nastaveni", "ok", "SMTP a automatické upomínky byly uloženy.");
  } catch (error) { return goWithMessage(request, "/nastaveni", "error", error instanceof Error ? error.message : "Nastavení se nepodařilo uložit."); }
}
