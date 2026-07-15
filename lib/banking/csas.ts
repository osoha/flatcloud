import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { BankingProvider, ConnectedBankAccount, IncomingTransaction, ProviderCredentials, ProviderSyncResult } from "./types";

// Přímý konektor na Premium - Accounts API České spořitelny.
// Konkrétní URL přidělí Erste Developer Portal pro sandbox/produkci, proto jsou konfigurovatelné.
const apiBase = () => (process.env.CSAS_API_BASE_URL || "").replace(/\/$/, "");
const authUrl = () => process.env.CSAS_AUTH_URL || "";
const tokenUrl = () => process.env.CSAS_TOKEN_URL || "";
const accountsPath = () => process.env.CSAS_ACCOUNTS_PATH || "/accounts";
const consentsPath = () => process.env.CSAS_CONSENTS_PATH || "/consents";
const transactionsTemplate = () => process.env.CSAS_TRANSACTIONS_PATH_TEMPLATE || "/accounts/{accountId}/transactions";
const balancesTemplate = () => process.env.CSAS_BALANCES_PATH_TEMPLATE || "/accounts/{accountId}/balances";

type Json = Record<string, unknown>;

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function obj(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function cents(value: unknown) {
  const n = Number(typeof value === "object" && value ? (value as Json).amount : value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
function endpoint(path: string) { return `${apiBase()}${path.startsWith("/") ? path : `/${path}`}`; }
function pathFor(template: string, accountId: string) { return template.replace("{accountId}", encodeURIComponent(accountId)); }
function webApiKey() { return process.env.CSAS_WEB_API_KEY || ""; }
function configured() {
  return Boolean(apiBase() && authUrl() && tokenUrl() && process.env.CSAS_CLIENT_ID && process.env.CSAS_CLIENT_SECRET && webApiKey());
}
function pkce() {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function request<T>(url: string, init: RequestInit = {}, accessToken?: string, psuIp?: string): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "web-api-key": webApiKey(),
      "X-Request-ID": randomUUID(),
      ...(psuIp ? { "PSU-IP-Address": psuIp } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Česká spořitelna API ${response.status}: ${text.slice(0, 600)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

function consentId(payload: unknown) {
  const row = obj(payload);
  return str(row.consentId) || str(row.consent_id) || str(row.id);
}

function accountRows(payload: unknown): unknown[] {
  const row = obj(payload);
  const data = obj(row.data);
  return array(row.accounts).length ? array(row.accounts) : array(data.accounts).length ? array(data.accounts) : array(row.items).length ? array(row.items) : array(payload);
}

function mapAccount(value: unknown, sessionId: string): ConnectedBankAccount | null {
  const row = obj(value);
  const accountId = obj(row.accountId || row.account_id || row.identification);
  const resourceId = str(row.resourceId) || str(row.resource_id) || str(row.id) || str(row.accountId) || str(accountId.iban);
  if (!resourceId) return null;
  const iban = str(row.iban) || str(accountId.iban);
  return {
    externalAccountId: resourceId,
    externalSessionId: sessionId,
    identificationHash: iban ? createHash("sha256").update(iban.replace(/\s/g, "").toUpperCase()).digest("hex") : resourceId,
    iban,
    name: str(row.name) || str(row.product) || str(row.details) || str(row.accountName),
    currency: str(row.currency) || str(obj(row.balance).currency) || "CZK",
  };
}

function txRows(payload: unknown): unknown[] {
  const row = obj(payload);
  const transactions = obj(row.transactions);
  const data = obj(row.data);
  return [
    ...array(row.booked), ...array(transactions.booked), ...array(row.items), ...array(data.transactions),
    ...(Array.isArray(payload) ? payload : []),
  ];
}

function variableSymbol(row: Json, message: string) {
  const candidates = [row.variableSymbol, row.variable_symbol, row.referenceNumber, row.reference_number, row.endToEndId, row.end_to_end_id, message].map(str).filter(Boolean) as string[];
  for (const candidate of candidates) {
    if (/^\d{1,10}$/.test(candidate)) return candidate;
    const match = candidate.match(/(?:^|\b)(?:VS|VARIABILN[IÍ]\s+SYMBOL)\s*[:\-]?\s*(\d{1,10})(?:\b|$)/i);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

function mapTransaction(value: unknown): IncomingTransaction | null {
  const row = obj(value);
  const amountObj = obj(row.transactionAmount || row.transaction_amount || row.amount);
  const amount = cents(Object.keys(amountObj).length ? amountObj : row.amount);
  const indicator = (str(row.creditDebitIndicator) || str(row.credit_debit_indicator) || "CRDT").toUpperCase();
  const signed = indicator === "DBIT" || amount < 0 ? -Math.abs(amount) : Math.abs(amount);
  if (signed <= 0) return null; // V8 eviduje pouze příchozí platby.
  const debtor = obj(row.debtor || row.counterparty || row.payer);
  const debtorAccount = obj(row.debtorAccount || row.debtor_account || row.counterpartyAccount || row.payerAccount);
  const remittance = row.remittanceInformationUnstructured || row.remittance_information || row.remittanceInformation || row.message || row.note;
  const message = Array.isArray(remittance) ? remittance.filter((v): v is string => typeof v === "string").join(" · ") : str(remittance) || "";
  const booked = str(row.bookingDate) || str(row.booking_date) || str(row.valueDate) || str(row.value_date) || str(row.transactionDate);
  const externalId = str(row.entryReference) || str(row.entry_reference) || str(row.transactionId) || str(row.transaction_id) || createHash("sha256").update(JSON.stringify(row)).digest("hex");
  return {
    externalId,
    bookedAt: booked ? new Date(booked.length === 10 ? `${booked}T12:00:00Z` : booked) : new Date(),
    amountCents: signed,
    currency: str(amountObj.currency) || str(row.currency) || "CZK",
    counterpartyName: str(debtor.name) || str(row.counterpartyName) || str(row.payerName),
    counterpartyIban: str(debtorAccount.iban) || str(row.counterpartyIban) || str(row.payerIban),
    variableSymbol: variableSymbol(row, message),
    message: message || undefined,
  };
}

async function refresh(credentials: ProviderCredentials) {
  const refreshToken = str(credentials.refreshToken);
  if (!refreshToken) throw new Error("Přístup České spořitelny vypršel a není dostupný obnovovací token. Připojte účet znovu.");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: process.env.CSAS_CLIENT_ID || "",
    client_secret: process.env.CSAS_CLIENT_SECRET || "",
  });
  const response = await fetch(tokenUrl(), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
  const text = await response.text();
  if (!response.ok) throw new Error(`Obnova tokenu České spořitelny selhala (${response.status}): ${text.slice(0, 500)}`);
  const data = JSON.parse(text) as Json;
  return {
    ...credentials,
    accessToken: str(data.access_token) || "",
    refreshToken: str(data.refresh_token) || refreshToken,
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 3600)) * 1000,
  } satisfies ProviderCredentials;
}

async function validCredentials(input?: ProviderCredentials) {
  if (!input || !str(input.accessToken)) throw new Error("Účet České spořitelny nemá uložený přístupový token. Připojte ho znovu.");
  const expiresAt = Number(input.expiresAt || 0);
  return expiresAt && expiresAt < Date.now() + 90_000 ? refresh(input) : input;
}

export const csasProvider: BankingProvider = {
  key: "csas-premium",
  label: "Česká spořitelna – Premium API",
  direct: true,
  configured,
  async listInstitutions() {
    return [{ name: "Česká spořitelna", country: "CZ", psuTypes: ["business", "personal"], maximumConsentValidity: 180 }];
  },
  async startAuthorization(input) {
    if (!configured()) throw new Error("Přímé API České spořitelny není nakonfigurováno v Render Environment.");
    const { verifier, challenge } = pkce();
    const validUntil = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const consentPayload = await request<unknown>(endpoint(consentsPath()), {
      method: "POST",
      body: JSON.stringify({ access: { accounts: [], balances: [], transactions: [] }, recurringIndicator: true, validUntil, frequencyPerDay: 24, combinedServiceIndicator: false }),
    }, undefined, input.psuIp);
    const consent = consentId(consentPayload);
    if (!consent) throw new Error("Česká spořitelna nevrátila ID souhlasu.");
    const scopeTemplate = process.env.CSAS_SCOPE_TEMPLATE || "AIS:{consentId} openid offline_access";
    const params = new URLSearchParams({
      redirect_uri: input.redirectUrl,
      client_id: process.env.CSAS_CLIENT_ID || "",
      response_type: "code",
      access_type: "offline",
      state: input.state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      scope: scopeTemplate.replace("{consentId}", consent),
    });
    return {
      url: `${authUrl()}${authUrl().includes("?") ? "&" : "?"}${params.toString()}`,
      externalAuthorizationId: consent,
      context: { codeVerifier: verifier, consentId: consent, redirectUrl: input.redirectUrl },
    };
  },
  async completeAuthorization(input) {
    const verifier = str(input.context?.codeVerifier);
    if (!verifier) throw new Error("Chybí PKCE ověření pro Českou spořitelnu. Spusťte připojení znovu.");
    const body = new URLSearchParams({
      redirect_uri: input.redirectUrl,
      client_id: process.env.CSAS_CLIENT_ID || "",
      client_secret: process.env.CSAS_CLIENT_SECRET || "",
      grant_type: "authorization_code",
      code_verifier: verifier,
      code: input.code,
    });
    const response = await fetch(tokenUrl(), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
    const text = await response.text();
    if (!response.ok) throw new Error(`Token České spořitelny selhal (${response.status}): ${text.slice(0, 500)}`);
    const tokenData = JSON.parse(text) as Json;
    const accessToken = str(tokenData.access_token);
    if (!accessToken) throw new Error("Česká spořitelna nevrátila access token.");
    const credentials: ProviderCredentials = {
      accessToken,
      refreshToken: str(tokenData.refresh_token) || null,
      expiresAt: Date.now() + Math.max(60, Number(tokenData.expires_in || 3600)) * 1000,
      consentId: str(input.context?.consentId) || null,
    };
    const payload = await request<unknown>(endpoint(accountsPath()), {}, accessToken, input.psuIp);
    const sessionId = str(input.context?.consentId) || randomUUID();
    const accounts = accountRows(payload).map((row) => mapAccount(row, sessionId)).filter((row): row is ConnectedBankAccount => Boolean(row));
    return { sessionId, accounts, credentials, consentExpiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000) };
  },
  async sync(account, options): Promise<ProviderSyncResult> {
    const credentials = await validCredentials(account.credentials);
    const accessToken = str(credentials.accessToken)!;
    const from = options?.dateFrom || (account.lastSyncedAt ? new Date(account.lastSyncedAt.getTime() - 7 * 24 * 60 * 60 * 1000) : new Date(Date.now() - 180 * 24 * 60 * 60 * 1000));
    const params = new URLSearchParams({ dateFrom: from.toISOString().slice(0, 10), bookingStatus: "booked" });
    if (options?.dateTo) params.set("dateTo", options.dateTo.toISOString().slice(0, 10));
    const path = `${pathFor(transactionsTemplate(), account.externalAccountId)}?${params.toString()}`;
    const payload = await request<unknown>(endpoint(path), {}, accessToken);
    const transactions = txRows(payload).map(mapTransaction).filter((row): row is IncomingTransaction => Boolean(row));
    let balance: ProviderSyncResult["balance"] = null;
    try {
      const balancePayload = await request<unknown>(endpoint(pathFor(balancesTemplate(), account.externalAccountId)), {}, accessToken);
      const rows = array(obj(balancePayload).balances).length ? array(obj(balancePayload).balances) : array(balancePayload);
      const first = obj(rows[0]);
      const amount = obj(first.balanceAmount || first.balance_amount || first.amount);
      balance = { amountCents: cents(Object.keys(amount).length ? amount : first.amount), currency: str(amount.currency) || "CZK" };
    } catch { /* balance is optional */ }
    return { transactions, balance, credentials };
  },
};
