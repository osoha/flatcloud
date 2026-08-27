import { createHash } from "node:crypto";
import { bankNameForCode, CZECH_BANKS } from "./czech-bank-registry";

export type ParsedBankPayment = {
  bank: string;
  bankName: string;
  trustedSource: boolean;
  recognizedPayment: boolean;
  autoProcessEligible: boolean;
  bankLike: boolean;
  messageId: string;
  subject?: string;
  sender?: string;
  receivedAt: Date;
  bookedAt?: Date;
  amountCents?: number;
  currency: string;
  recipientAccount?: string;
  counterpartyName?: string;
  counterpartyAccount?: string;
  variableSymbol?: string;
  specificSymbol?: string;
  constantSymbol?: string;
  message?: string;
  rawExcerpt: string;
  parseNote: string;
  // Backwards-compatible semantic used by old V20 tests/callers: safe for automatic processing.
  validPayment: boolean;
};

export type ParsedRbPayment = ParsedBankPayment;

type Input = {
  messageId?: string | null;
  subject?: string | null;
  from?: string | null;
  returnPath?: string | null;
  authenticationResults?: string | null;
  date?: Date | null;
  text?: string | null;
};

const nbsp = /[\u00a0\u202f]/g;

// Bank-specific rules are intentionally only an extra trust layer. Extraction and bank
// identification work without an adapter. Add a rule after a real notification format
// has been observed and its sender domain verified.
const trustedSenderRules = [
  {
    bankCode: "5500",
    domains: ["rb.cz", "raiffeisenbank.cz"],
    text: /raiffeisen(?:bank)?|\brb\b|informuj mě|informuj me/i,
  },
  {
    bankCode: "0800",
    domains: ["csas.cz", "ceskasporitelna.cz"],
    text: /česk[aá]\s+spořitelna|cesk[aá]\s+sporitelna|české\s+spořitelny|ceske\s+sporitelny/i,
  },
];

export function normalizeBankAccount(value?: string | null) {
  const raw = (value || "").toUpperCase().replace(nbsp, " ").trim();
  if (!raw) return "";
  if (/^CZ\d{2}/.test(raw.replace(/\s/g, ""))) return raw.replace(/\s/g, "");
  const compact = raw.replace(/\s/g, "");
  const match = compact.match(/^([0-9]{0,6}-)?([0-9]{1,10})\/([0-9]{4})$/);
  if (!match) return compact.replace(/[^A-Z0-9/-]/g, "");
  const prefix = (match[1] || "").replace(/-$/, "").replace(/^0+/, "");
  const number = match[2].replace(/^0+/, "") || "0";
  return `${prefix ? `${prefix}-` : ""}${number}/${match[3]}`;
}

export function bankCodeFromAccount(value?: string | null) {
  const normalized = normalizeBankAccount(value);
  const local = normalized.match(/\/(\d{4})$/)?.[1];
  if (local) return local;
  // Czech IBAN: CZkk bbbb pppppp aaaaaaaaaa, bbbb is the bank code.
  if (/^CZ\d{22}$/.test(normalized)) return normalized.slice(4, 8);
  return undefined;
}

export { bankNameForCode } from "./czech-bank-registry";

export function ownerAccountAliases(account: { accountNumber?: string | null; bankCode?: string | null; iban?: string | null }) {
  const aliases = new Set<string>();
  if (account.iban) aliases.add(normalizeBankAccount(account.iban));
  if (account.accountNumber && account.bankCode) aliases.add(normalizeBankAccount(`${account.accountNumber}/${account.bankCode}`));
  return aliases;
}

export function bankAccountMatches(ownerAccount: { accountNumber?: string | null; bankCode?: string | null; iban?: string | null }, parsed?: string | null) {
  const needle = normalizeBankAccount(parsed);
  return Boolean(needle && ownerAccountAliases(ownerAccount).has(needle));
}

function cleanText(value?: string | null) {
  return (value || "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/?(?:p|div|tr|td|th|li|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(nbsp, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function lineValue(text: string, labels: string[]) {
  for (const label of labels) {
    const rx = new RegExp(`(?:^|\\n)\\s*${label}\\s*[:\\-]?\\s*([^\\n]+)`, "i");
    const match = text.match(rx);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return undefined;
}

function accountFromValue(value?: string) {
  if (!value) return undefined;
  const iban = value.match(/CZ\d{2}(?:\s*[A-Z0-9]){20,}/i)?.[0];
  if (iban) return normalizeBankAccount(iban);
  const local = value.match(/(?:\d{0,6}-)?\d{1,10}\s*\/\s*\d{4}/)?.[0];
  return local ? normalizeBankAccount(local) : undefined;
}

function symbol(text: string, labels: string[], abbrev: string) {
  const direct = lineValue(text, labels);
  const directDigits = direct?.match(/\d{1,12}/)?.[0];
  if (directDigits) return directDigits.replace(/^0+(?=\d)/, "");
  const rx = new RegExp(`(?:^|\\b)${abbrev}\\s*[:\\-]?\\s*(\\d{1,12})(?:\\b|$)`, "i");
  const match = text.match(rx)?.[1];
  return match?.replace(/^0+(?=\d)/, "");
}

export function parseMoneyToCents(value?: string | null) {
  if (!value) return undefined;
  const match = value.replace(nbsp, " ").match(/([+-]?\s*\d[\d\s.]*[,.]\d{2}|[+-]?\s*\d[\d\s.]*)\s*(CZK|Kč|EUR|€)?/i);
  if (!match) return undefined;
  let raw = match[1].replace(/\s/g, "");
  const hasComma = raw.includes(",");
  if (hasComma) raw = raw.replace(/\./g, "").replace(",", ".");
  else {
    const dots = (raw.match(/\./g) || []).length;
    if (dots > 1 || (dots === 1 && /\.\d{3}$/.test(raw))) raw = raw.replace(/\./g, "");
  }
  const amount = Number(raw);
  return Number.isFinite(amount) ? Math.round(amount * 100) : undefined;
}

function amountAndCurrency(text: string) {
  const labeled = lineValue(text, [
    "Částka(?: platby)?", "Castka(?: platby)?", "Připsaná částka", "Pripsana castka",
    "Příchozí částka", "Prichozi castka", "Výše platby", "Vyse platby", "Payment amount",
    "Credited amount", "Realizováno", "Realizovano", "Amount",
  ]);
  const generic = labeled || text.match(/(?:\+\s*)?\d[\d\s\u00a0.]*[,.]\d{2}\s*(?:CZK|Kč|EUR|€)/i)?.[0];
  const amountCents = parseMoneyToCents(generic);
  const currencyRaw = generic?.match(/CZK|Kč|EUR|€/i)?.[0]?.toUpperCase();
  const currency = currencyRaw === "EUR" || currencyRaw === "€" ? "EUR" : "CZK";
  return { amountCents, currency };
}

function parseDate(value?: string, fallback?: Date | null) {
  const match = value?.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!match) return fallback || undefined;
  const [, d, m, y, h = "12", min = "00"] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min), 0, 0);
  return Number.isNaN(date.getTime()) ? fallback || undefined : date;
}

function fallbackAccountSearch(text: string, kind: "recipient" | "counterparty") {
  const account = "((?:\\d{0,6}-)?\\d{1,10}\\s*\\/\\s*\\d{4}|CZ\\d{2}(?:\\s*[A-Z0-9]){20,})";
  const patterns = kind === "recipient"
    ? [
        new RegExp(`(?:na|pro|váš|vas|příjemce|prijemce|recipient|beneficiary|credited)\\s+(?:účet|ucet|účtu|uctu|account)[^\\n]{0,45}${account}`, "i"),
        new RegExp(`(?:account credited|credited account|beneficiary account)[^\\n]{0,30}${account}`, "i"),
      ]
    : [
        new RegExp(`(?:z|od|protiúčet|protiucet|plátce|platce|sender|payer|counterparty)[^\\n]{0,45}${account}`, "i"),
        new RegExp(`(?:sender account|payer account|counterparty account)[^\\n]{0,30}${account}`, "i"),
      ];
  for (const pattern of patterns) {
    const hit = text.match(pattern)?.[1];
    if (hit) return normalizeBankAccount(hit);
  }
  return undefined;
}

function domainFromAddress(value?: string | null) {
  const match = (value || "").toLowerCase().match(/@([a-z0-9.-]+)\b/);
  return match?.[1]?.replace(/>$/, "");
}

function domainAllowed(domain: string | undefined, allowed: string[]) {
  if (!domain) return false;
  return allowed.some((item) => domain === item || domain.endsWith(`.${item}`));
}

function authExplicitlyFailed(value?: string | null) {
  const auth = (value || "").toLowerCase();
  return /\bdmarc=fail\b/.test(auth) || (/\bspf=fail\b/.test(auth) && /\bdkim=fail\b/.test(auth));
}

function detectBank(combined: string, from?: string | null, returnPath?: string | null, recipientAccount?: string | null) {
  const accountCode = bankCodeFromAccount(recipientAccount);
  if (accountCode) return { code: accountCode, name: bankNameForCode(accountCode), registryKnown: Boolean(CZECH_BANKS[accountCode]) };

  const fromDomain = domainFromAddress(from);
  const returnDomain = domainFromAddress(returnPath);
  const adapter = trustedSenderRules.find((item) => domainAllowed(fromDomain, item.domains) || domainAllowed(returnDomain, item.domains))
    || trustedSenderRules.find((item) => item.text.test(combined));
  if (adapter) return { code: adapter.bankCode, name: bankNameForCode(adapter.bankCode), registryKnown: true };
  return { code: "UNKNOWN", name: "Neznámá banka", registryKnown: false };
}

function sourceTrusted(bankCode: string, input: Input) {
  const rule = trustedSenderRules.find((item) => item.bankCode === bankCode);
  if (!rule) return false;
  const fromDomain = domainFromAddress(input.from);
  const returnDomain = domainFromAddress(input.returnPath);
  const knownDomain = domainAllowed(fromDomain, rule.domains) || domainAllowed(returnDomain, rule.domains);
  if (!knownDomain || authExplicitlyFailed(input.authenticationResults)) return false;
  return true;
}

export function parseBankNotification(input: Input): ParsedBankPayment {
  const subject = cleanText(input.subject);
  const text = cleanText(input.text);
  const combined = `${subject}\n${text}`.trim();
  const hash = createHash("sha256").update(`${input.from || ""}|${subject}|${text}`).digest("hex");
  const messageId = input.messageId?.trim() || `bank-email-${hash}`;
  const { amountCents, currency } = amountAndCurrency(combined);

  const recipientValue = lineValue(combined, [
    "Na účet", "Na ucet", "Účet příjemce", "Ucet prijemce", "Váš účet", "Vas ucet",
    "Příjemce - účet", "Prijemce - ucet", "Příjemce účet", "Prijemce ucet",
    "Recipient account", "Beneficiary account", "Credited account", "Account credited", "Na",
  ]);
  const counterpartyValue = lineValue(combined, [
    "Protiúčet", "Protiucet", "Účet plátce", "Ucet platce", "Z účtu", "Z uctu",
    "Plátce - účet", "Platce - ucet", "Odesílatel - účet", "Odesilatel - ucet",
    "Sender account", "Payer account", "Counterparty account", "Z",
  ]);
  const recipientAccount = accountFromValue(recipientValue) || fallbackAccountSearch(combined, "recipient");
  const counterpartyAccount = accountFromValue(counterpartyValue) || fallbackAccountSearch(combined, "counterparty");
  const counterpartyName = lineValue(combined, [
    "Jméno plátce", "Jmeno platce", "Název protiúčtu", "Nazev protiuctu", "Plátce", "Platce",
    "Odesílatel", "Odesilatel", "Protistrana", "Sender", "Payer", "Counterparty",
  ]);
  const variableSymbol = symbol(combined, ["Variabilní symbol", "Variabilni symbol", "Variable symbol"], "VS");
  const specificSymbol = symbol(combined, ["Specifický symbol", "Specificky symbol", "Specific symbol"], "SS");
  const constantSymbol = symbol(combined, ["Konstantní symbol", "Konstantni symbol", "Constant symbol"], "KS");
  const message = lineValue(combined, [
    "Zpráva pro příjemce", "Zprava pro prijemce", "Zpráva", "Zprava", "Poznámka", "Poznamka",
    "Message for recipient", "Payment message", "Message", "Note",
  ]);
  const dateValue = lineValue(combined, [
    "Datum zaúčtování", "Datum zauctovani", "Datum platby", "Datum připsání", "Datum pripsani",
    "Booking date", "Payment date", "Value date", "Date", "Datum", "Dne",
  ]);
  const bookedAt = parseDate(dateValue, input.date);
  const bank = detectBank(combined, input.from, input.returnPath, recipientAccount);
  const trustedSource = sourceTrusted(bank.code, input);
  const positiveAmount = typeof amountCents === "number" && amountCents > 0;
  const recognizedPayment = positiveAmount && Boolean(recipientAccount);
  const autoProcessEligible = recognizedPayment && trustedSource;
  const paymentWording = /(?:příchoz|prijata|přips|prips|platb|účet|ucet|bankovn|transakc|částk|castk|payment|credited|beneficiary|payer|iban|variabilní symbol|variabilni symbol|\bVS\s*[:\-]?\s*\d|\bSS\s*[:\-]?\s*\d|\bKS\s*[:\-]?\s*\d|\bCZK\b|\bKč\b|\bEUR\b|€)/i.test(combined);
  // Sender trust helps, but is never required: bank notifications are often forwarded
  // from the account owner's mailbox. Ambiguous bank-like mail stays in manual review.
  const bankLike = trustedSource || bank.code !== "UNKNOWN" || paymentWording || amountCents !== undefined || Boolean(recipientAccount || counterpartyAccount || variableSymbol || specificSymbol || constantSymbol);
  const missing = [!amountCents && "částka", !recipientAccount && "cílový účet", !variableSymbol && "VS"].filter(Boolean);

  let parseNote: string;
  if (!positiveAmount) {
    parseNote = "Nebyla rozpoznána kladná příchozí částka.";
  } else if (!recipientAccount) {
    parseNote = "Částka byla rozpoznána, ale chybí cílový účet. Vyžaduje ruční kontrolu.";
  } else if (!trustedSource) {
    const known = bank.code !== "UNKNOWN" ? `${bank.name} (${bank.code})` : "Banka";
    parseNote = `${known}: platební údaje byly rozpoznány, ale zdroj zatím není v seznamu ověřených bankovních odesílatelů. Platba čeká na ruční potvrzení.`;
  } else if (missing.length) {
    parseNote = `${bank.name}: platba rozpoznána, chybí ${missing.join(", ")}. Bude vyžadovat opatrnější párování.`;
  } else {
    parseNote = `${bank.name}: důvěryhodná bankovní notifikace rozpoznána včetně částky, cílového účtu a VS.`;
  }

  return {
    bank: bank.code,
    bankName: bank.name,
    trustedSource,
    recognizedPayment,
    autoProcessEligible,
    bankLike,
    messageId,
    subject: subject || undefined,
    sender: input.from?.trim() || undefined,
    receivedAt: input.date || new Date(),
    bookedAt,
    amountCents,
    currency,
    recipientAccount,
    counterpartyName,
    counterpartyAccount,
    variableSymbol,
    specificSymbol,
    constantSymbol,
    message,
    rawExcerpt: combined.slice(0, 4000),
    parseNote,
    validPayment: autoProcessEligible,
  };
}

// V20 compatibility: old callers still use this name, but the parser is now bank-agnostic.
export function parseRbNotification(input: Input) {
  return parseBankNotification(input);
}
