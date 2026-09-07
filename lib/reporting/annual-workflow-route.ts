import { CzkMoneyParseError } from "../forms";

const friendlyMessages = new Map([
  ["Reporting group is inactive.", "Skupina je neaktivní. Nový výroční report nelze založit."],
  ["An annual report already exists for this year.", "Pro tento rok již výroční report existuje."],
  ["Reporting group has no effective properties at annual report end.", "Skupina nemá k poslednímu dni roku žádné platné nemovitosti."],
  ["Annual report year is invalid.", "Rok výročního reportu není platný."],
  ["Annual report was not found.", "Výroční report nebyl nalezen."],
  ["Annual report content can only change in DRAFT.", "Obsah výročního reportu lze upravovat pouze v konceptu."],
  ["Annual report is no longer editable.", "Výroční report již nelze upravit."],
  ["Annual property chapter is missing or no longer editable.", "Kapitola nemovitosti chybí nebo ji již nelze upravit."],
  ["Reporting EDIT permission is required.", "Nemáte oprávnění upravovat tento výroční report."],
]);

export function annualWorkflowErrorMessage(error: unknown) {
  if (error instanceof CzkMoneyParseError) return "Zadaná částka není platná.";
  if (error instanceof Error) {
    const friendly = friendlyMessages.get(error.message);
    if (friendly) return friendly;
    if (error.name === "ZodError") return "Zadaný obsah výročního reportu není platný.";
  }
  console.error("Annual report workflow operation failed.", error);
  return "Operaci se nepodařilo provést.";
}
