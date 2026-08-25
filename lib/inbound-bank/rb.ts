import { createHash } from "node:crypto";

export type ParsedRbPayment = {
  bank: "RB";
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
  validPayment: boolean;
};

type Input = {
  messageId?: string | null;
  subject?: string | null;
  from?: string | null;
  date?: Date | null;
  text?: string | null;
};

const nbsp = /[\u00a0\u202f]/g;

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
  const labeled = lineValue(text, ["Částka(?: platby)?", "Připsaná částka", "Příchozí částka", "Realizováno", "Realizovano", "Amount"]);
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
  const patterns = kind === "recipient"
    ? [/(?:na|pro|váš|příjemce)\s+(?:účet|účtu)[^\n]{0,25}((?:\d{0,6}-)?\d{1,10}\s*\/\s*5500|CZ\d{2}(?:\s*[A-Z0-9]){20,})/i]
    : [/(?:z|od|protiúčet|plátce)[^\n]{0,25}((?:\d{0,6}-)?\d{1,10}\s*\/\s*\d{4}|CZ\d{2}(?:\s*[A-Z0-9]){20,})/i];
  for (const pattern of patterns) {
    const hit = text.match(pattern)?.[1];
    if (hit) return normalizeBankAccount(hit);
  }
  return undefined;
}

export function parseRbNotification(input: Input): ParsedRbPayment {
  const subject = cleanText(input.subject);
  const text = cleanText(input.text);
  const combined = `${subject}\n${text}`.trim();
  const hash = createHash("sha256").update(`${input.from || ""}|${subject}|${text}`).digest("hex");
  const messageId = input.messageId?.trim() || `rb-${hash}`;
  const { amountCents, currency } = amountAndCurrency(combined);

  const recipientValue = lineValue(combined, ["Na účet", "Účet příjemce", "Váš účet", "Příjemce - účet", "Příjemce účet", "Na"]);
  const counterpartyValue = lineValue(combined, ["Protiúčet", "Účet plátce", "Z účtu", "Plátce - účet", "Odesílatel - účet", "Z"]);
  const recipientAccount = accountFromValue(recipientValue) || fallbackAccountSearch(combined, "recipient");
  const counterpartyAccount = accountFromValue(counterpartyValue) || fallbackAccountSearch(combined, "counterparty");
  const counterpartyName = lineValue(combined, ["Jméno plátce", "Název protiúčtu", "Plátce", "Odesílatel", "Protistrana"]);
  const variableSymbol = symbol(combined, ["Variabilní symbol", "Variabilni symbol"], "VS");
  const specificSymbol = symbol(combined, ["Specifický symbol", "Specificky symbol"], "SS");
  const constantSymbol = symbol(combined, ["Konstantní symbol", "Konstantni symbol"], "KS");
  const message = lineValue(combined, ["Zpráva pro příjemce", "Zpráva", "Poznámka", "Message"]);
  const dateValue = lineValue(combined, ["Datum zaúčtování", "Datum zauctovani", "Datum platby", "Datum připsání", "Datum", "Dne"]);
  const bookedAt = parseDate(dateValue, input.date);

  const looksLikeRb = /raiffeisen|\brb\b|informuj mě|informuj me/i.test(combined) || /@rb\.cz\b/i.test(input.from || "");
  const positiveAmount = typeof amountCents === "number" && amountCents > 0;
  const validPayment = looksLikeRb && positiveAmount;
  const missing = [!amountCents && "částka", !recipientAccount && "cílový účet", !variableSymbol && "VS"].filter(Boolean);
  const parseNote = !looksLikeRb
    ? "Zpráva nevypadá jako notifikace Raiffeisenbank."
    : !positiveAmount
      ? "Nebyla rozpoznána kladná příchozí částka."
      : missing.length
        ? `Platba rozpoznána, chybí ${missing.join(", ")}. Bude vyžadovat opatrnější párování.`
        : "RB notifikace rozpoznána včetně částky, cílového účtu a VS.";

  return {
    bank: "RB",
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
    validPayment,
  };
}
