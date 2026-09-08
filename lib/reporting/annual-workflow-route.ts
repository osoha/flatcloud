import { CzkMoneyParseError } from "../forms";

const friendlyMessages = new Map([
  ["Změnu polohy potvrďte až po kontrole souřadnic.", "Změnu polohy potvrďte až po kontrole souřadnic."],
  ["Reporting group is inactive.", "Skupina je neaktivní. Nový výroční report nelze založit."],
  ["An annual report already exists for this year.", "Pro tento rok již výroční report existuje."],
  ["Reporting group has no effective properties at annual report end.", "Skupina nemá k poslednímu dni roku žádné platné nemovitosti."],
  ["Annual report year is invalid.", "Rok výročního reportu není platný."],
  ["Annual report was not found.", "Výroční report nebyl nalezen."],
  ["Annual report content can only change in DRAFT.", "Obsah výročního reportu lze upravovat pouze v konceptu."],
  ["Annual report is no longer editable.", "Výroční report již nelze upravit."],
  ["Annual property chapter is missing or no longer editable.", "Kapitola nemovitosti chybí nebo ji již nelze upravit."],
  ["Reporting EDIT permission is required.", "Nemáte oprávnění upravovat tento výroční report."],
  ["Published annual report revisions are immutable.", "Publikovaná revize výročního reportu je neměnná."],
  ["Annual reporting workflow transition is not permitted.", "Tato změna stavu výročního reportu není povolena."],
  ["Annual report property scope is incomplete or inconsistent.", "Rozsah nemovitostí výročního reportu není úplný nebo konzistentní."],
  ["Annual report snapshot scope is inconsistent.", "Zmrazené snapshoty výročního reportu nejsou konzistentní."],
  ["Annual report snapshot source is invalid.", "Zdroj snapshotu výročního reportu není platný."],
  ["Annual report status changed concurrently.", "Stav výročního reportu se mezitím změnil."],
  ["Annual report preview can only be approved in REVIEW.", "Kontrolu PDF lze potvrdit pouze ve stavu Ke kontrole."],
  ["Annual report PDF preview must be approved before publication.", "Před publikací musí administrátor potvrdit kontrolu PDF náhledu."],
  ["Annual corrections can only be created from a published report.", "Opravnou revizi lze vytvořit pouze z publikovaného výročního reportu."],
  ["Annual correction must be created from the latest published revision and no active revision may exist.", "Opravnou revizi lze založit pouze z poslední publikované revize, pokud neexistuje rozpracovaná revize."],
  ["Invalid annual report transition.", "Neplatná změna stavu výročního reportu."],
]);

export function annualWorkflowErrorMessage(error: unknown) {
  if (error instanceof CzkMoneyParseError) return "Zadaná částka není platná.";
  if (error instanceof Error) {
    const friendly = friendlyMessages.get(error.message);
    if (friendly) return friendly;
    if (error.message.startsWith("Annual report period is still open.")) return "Rok ještě není uzavřený. Ke kontrole lze report odeslat až po 31. prosinci.";
    if (error.message.startsWith("Annual report is incomplete:")) return `Výroční report není kompletní: ${error.message.slice("Annual report is incomplete:".length).trim()}`;
    if (error.name === "ZodError") return "Zadaný obsah výročního reportu není platný.";
  }
  console.error("Annual report workflow operation failed.", error);
  return "Operaci se nepodařilo provést.";
}
