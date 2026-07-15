import { createHash } from "node:crypto";
import { importPKCS8, SignJWT } from "jose";
import type { BankingProvider, BankInstitution, ConnectedBankAccount, IncomingTransaction } from "./types";

const BASE_URL = process.env.ENABLE_BANKING_BASE_URL || "https://api.enablebanking.com";

type JsonObject = Record<string, unknown>;

function privateKeyPem() {
  return (process.env.ENABLE_BANKING_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
}

async function token() {
  const appId = process.env.ENABLE_BANKING_APP_ID;
  const pem = privateKeyPem();
  if (!appId || !pem) throw new Error("Enable Banking není nakonfigurován. Doplňte ENABLE_BANKING_APP_ID a ENABLE_BANKING_PRIVATE_KEY.");
  const key = await importPKCS8(pem, "RS256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: appId })
    .setIssuer("enablebanking.com")
    .setAudience("api.enablebanking.com")
    .setIssuedAt()
    .setExpirationTime("55m")
    .sign(key);
}

async function api<T>(path: string, init: RequestInit = {}, psu?: { ip?: string; userAgent?: string }): Promise<T> {
  const authorization = await token();
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${authorization}`,
      ...(psu?.ip ? { "Psu-Ip-Address": psu.ip } : {}),
      ...(psu?.userAgent ? { "Psu-User-Agent": psu.userAgent } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Enable Banking API ${response.status}: ${text.slice(0, 500)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function accountFrom(value: unknown, sessionId: string): ConnectedBankAccount | null {
  if (!value || typeof value !== "object") return null;
  const row = value as JsonObject;
  const uid = asString(row.uid) || asString(row.id);
  if (!uid) return null;
  const accountId = (row.account_id && typeof row.account_id === "object" ? row.account_id : {}) as JsonObject;
  return {
    externalAccountId: uid,
    externalSessionId: sessionId,
    identificationHash: asString(row.identification_hash),
    iban: asString(accountId.iban),
    name: asString(row.details) || asString(row.name) || asString(row.product),
    currency: asString(row.currency) || "CZK",
  };
}

function parseAmount(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const amount = Number((value as JsonObject).amount || 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function extractVariableSymbol(reference: string | undefined, message: string): string | undefined {
  const candidates = [reference, message].filter(Boolean).join(" ");
  const match = candidates.match(/(?:^|\b)(?:VS|VARIABILN[IÍ]\s+SYMBOL)\s*[:\-]?\s*(\d{1,10})(?:\b|$)/i);
  if (match?.[1]) return match[1];
  if (reference && /^\d{1,10}$/.test(reference)) return reference;
  return undefined;
}

function stableId(row: JsonObject) {
  return asString(row.entry_reference) || asString(row.transaction_id) || createHash("sha256").update(JSON.stringify(row)).digest("hex");
}

function mapTransaction(value: unknown): IncomingTransaction | null {
  if (!value || typeof value !== "object") return null;
  const row = value as JsonObject;
  const indicator = asString(row.credit_debit_indicator) || "CRDT";
  const amount = parseAmount(row.transaction_amount);
  const signedAmount = indicator === "DBIT" ? -Math.abs(amount) : Math.abs(amount);
  const incoming = signedAmount >= 0;
  const party = (incoming ? row.debtor : row.creditor) as JsonObject | undefined;
  const partyAccount = (incoming ? row.debtor_account : row.creditor_account) as JsonObject | undefined;
  const remittance = Array.isArray(row.remittance_information) ? row.remittance_information.filter((item): item is string => typeof item === "string") : [];
  const message = [...remittance, asString(row.note)].filter(Boolean).join(" · ");
  const currency = row.transaction_amount && typeof row.transaction_amount === "object" ? asString((row.transaction_amount as JsonObject).currency) : undefined;
  const booked = asString(row.booking_date) || asString(row.transaction_date) || asString(row.value_date);
  return {
    externalId: stableId(row),
    bookedAt: booked ? new Date(`${booked}T12:00:00Z`) : new Date(),
    amountCents: signedAmount,
    currency: currency || "CZK",
    counterpartyName: party ? asString(party.name) : undefined,
    counterpartyIban: partyAccount ? asString(partyAccount.iban) : undefined,
    variableSymbol: extractVariableSymbol(asString(row.reference_number), message),
    message: message || asString(row.reference_number),
  };
}

export const enableBankingProvider: BankingProvider = {
  key: "enablebanking",
  label: "Další banky – Open Banking",
  direct: false,
  configured() { return Boolean(process.env.ENABLE_BANKING_APP_ID && privateKeyPem()); },
  async listInstitutions(country) {
    const data = await api<{ aspsps?: unknown[] }>(`/aspsps?country=${encodeURIComponent(country.toUpperCase())}`);
    const rows = Array.isArray(data.aspsps) ? data.aspsps : Array.isArray(data) ? data as unknown[] : [];
    return rows.flatMap((value): BankInstitution[] => {
      if (!value || typeof value !== "object") return [];
      const row = value as JsonObject;
      const name = asString(row.name); const bankCountry = asString(row.country);
      if (!name || !bankCountry) return [];
      return [{
        name,
        country: bankCountry,
        logo: asString(row.logo),
        psuTypes: Array.isArray(row.psu_types) ? row.psu_types.filter((item): item is string => typeof item === "string") : ["business"],
        maximumConsentValidity: typeof row.maximum_consent_validity === "number" ? row.maximum_consent_validity : undefined,
      }];
    });
  },
  async startAuthorization(input) {
    const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const data = await api<{ url: string; authorization_id?: string }>("/auth", {
      method: "POST",
      body: JSON.stringify({
        access: { valid_until: validUntil, balances: true, transactions: true },
        aspsp: { name: input.bankName, country: input.country.toUpperCase() },
        state: input.state,
        redirect_url: input.redirectUrl,
        psu_type: input.psuType,
        language: "cs",
      }),
    }, { ip: input.psuIp, userAgent: input.userAgent });
    return { url: data.url, externalAuthorizationId: data.authorization_id };
  },
  async completeAuthorization(input) {
    const created = await api<{ session_id: string; accounts?: unknown[] }>("/sessions", {
      method: "POST",
      body: JSON.stringify({ code: input.code }),
    }, { ip: input.psuIp, userAgent: input.userAgent });
    const sessionId = created.session_id;
    let rawAccounts = created.accounts;
    if (!Array.isArray(rawAccounts) || rawAccounts.some((item) => typeof item === "string")) {
      const session = await api<{ accounts?: unknown[] }>(`/sessions/${encodeURIComponent(sessionId)}`);
      rawAccounts = session.accounts;
    }
    const accounts = (rawAccounts || []).map((row) => accountFrom(row, sessionId)).filter((row): row is ConnectedBankAccount => Boolean(row));
    return { sessionId, accounts };
  },
  async sync(account, options) {
    const dateFrom = options?.dateFrom
      ? options.dateFrom.toISOString().slice(0, 10)
      : account.lastSyncedAt
        ? new Date(account.lastSyncedAt.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        : new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const all: IncomingTransaction[] = [];
    let continuation: string | undefined;
    for (let page = 0; page < 30; page += 1) {
      const query = new URLSearchParams({ date_from: dateFrom, transaction_status: "BOOK", strategy: options?.strategy || "default" });
      if (options?.dateTo) query.set("date_to", options.dateTo.toISOString().slice(0, 10));
      if (continuation) query.set("continuation_key", continuation);
      const data = await api<{ transactions?: unknown[]; continuation_key?: string }>(`/accounts/${encodeURIComponent(account.externalAccountId)}/transactions?${query.toString()}`);
      for (const row of data.transactions || []) { const mapped = mapTransaction(row); if (mapped) all.push(mapped); }
      continuation = asString(data.continuation_key);
      if (!continuation) break;
    }
    let balance: { amountCents: number; currency: string } | null = null;
    try {
      const data = await api<{ balances?: Array<{ balance_amount?: { amount?: string; currency?: string }; balance_type?: string }> }>(`/accounts/${encodeURIComponent(account.externalAccountId)}/balances`);
      const row = data.balances?.find((item) => item.balance_type === "CLAV") || data.balances?.[0];
      if (row?.balance_amount) balance = { amountCents: Math.round(Number(row.balance_amount.amount || 0) * 100), currency: row.balance_amount.currency || "CZK" };
    } catch { /* zůstatek není podmínkou synchronizace */ }
    return { transactions: all.filter((row) => row.amountCents > 0), balance };
  },
};
