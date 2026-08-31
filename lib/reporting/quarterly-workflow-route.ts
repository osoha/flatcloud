import { prisma } from "../db";
import { CzkMoneyParseError } from "../forms";
import { ImageProcessingError } from "../documents/image-processing";
import { StorageTimeoutError, StorageUnavailableError } from "../storage/types";

const friendlyMessages = new Map([
  ["Reporting group is inactive.", "Skupina je neaktivní. Nový kvartální report nelze založit."],
  ["An active DRAFT or REVIEW report already exists for this quarter.", "Pro tento kvartál již existuje rozpracovaný report."],
  ["Use correction workflow to create a revision of a published report.", "Pro tento kvartál již existuje publikovaný report. Další revizi bude možné vytvořit přes opravu reportu."],
  ["Reporting group has no effective properties at report quarter end.", "Skupina nemá k rozhodnému datu žádné platné nemovitosti."],
  ["Reporting EDIT permission is required.", "Nemáte oprávnění upravovat tento kvartální report."],
  ["Reporting ADMIN permission is required.", "Nemáte oprávnění vrátit tento report do konceptu."],
  ["Quarterly report was not found.", "Kvartální report nebyl nalezen."],
  ["Quarter snapshot was not found.", "Snapshot nebyl nalezen."],
  ["Property report was not found.", "Nemovitost není součástí reportu."],
  ["Property report is missing or no longer editable.", "Nemovitost není součástí reportu nebo report již nelze upravit."],
  ["Report content can only change in DRAFT.", "Snapshoty lze měnit pouze v konceptu reportu."],
  ["Editorial content can only change in DRAFT.", "Obsah reportu lze upravovat pouze v konceptu."],
  ["Every property report must have a property status before review.", "U všech nemovitostí musí být před odesláním ke kontrole vyplněn stav projektu."],
  ["Report has blocking data quality issues.", "Report obsahuje blokující chyby kvality dat. Před publikací je nutné je odstranit."],
  ["Report warnings must be acknowledged before publication.", "Report obsahuje warningy kvality dat. Před publikací je musí administrátor výslovně potvrdit."],
  ["Warnings can only be acknowledged in REVIEW.", "Warningy lze potvrdit pouze ve stavu Ke kontrole."],
  ["Report has no warnings to acknowledge.", "Report neobsahuje žádné warningy k potvrzení."],
  ["Current review cycle was not found.", "Nepodařilo se určit aktuální kontrolní cyklus reportu."],
  ["Corrections can only be created from a published report.", "Opravnou revizi lze vytvořit pouze z publikovaného reportu."],
  ["Correction must be created from the latest published revision and no active revision may exist.", "Opravu lze založit pouze z poslední publikované revize, pokud již neexistuje novější rozpracovaná revize."],
  ["Reporting workflow transition is not permitted.", "Tento přechod stavu reportu není povolen."],
  ["Report status changed concurrently.", "Stav reportu se mezitím změnil. Načtěte stránku znovu."],
]);

export class QuarterlyWorkflowRouteError extends Error {
  constructor(message: string) { super(message); this.name = "QuarterlyWorkflowRouteError"; }
}

export async function requireReportInGroup(reportId: string, groupId: string) {
  const report = await prisma.quarterlyReport.findFirst({ where: { id: reportId, reportingGroupId: groupId }, select: { id: true } });
  if (!report) throw new QuarterlyWorkflowRouteError("Kvartální report nebyl nalezen.");
}

export function quarterlyWorkflowErrorMessage(error: unknown) {
  if (error instanceof QuarterlyWorkflowRouteError) return error.message;
  if (error instanceof CzkMoneyParseError) return "Zadaná částka není platná.";
  if (error instanceof ImageProcessingError) return error.message;
  if (error instanceof StorageTimeoutError || error instanceof StorageUnavailableError) return error.message;
  if (error instanceof Error) {
    const friendly = friendlyMessages.get(error.message);
    if (friendly) return friendly;
    if (/File size must be between/.test(error.message)) return "Fotografie je prázdná nebo překračuje povolenou velikost.";
    if (/Unsupported file type|does not match its MIME type|must be an image/.test(error.message)) return "Vybraný soubor není podporovaný obrázek JPEG, PNG nebo WEBP.";
    if (/^S3_[A-Z0-9_]+ is required/.test(error.message)) return "Úložiště fotografií není správně nakonfigurováno.";
    if (/Quarter must be 1-4|Revision must be at least 1/.test(error.message)) return "Rok nebo kvartál není platný.";
    if (error.name === "ZodError" || error instanceof SyntaxError) return "Zadaný obsah reportu není platný.";
  }
  console.error("Quarterly report workflow operation failed.", error);
  return "Operaci se nepodařilo provést.";
}
