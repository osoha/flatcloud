import { createHash } from "node:crypto";
import type { BankingProvider } from "./types";

function shortHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export const mockBankingProvider: BankingProvider = {
  key: "mock",
  configured: () => true,
  async listInstitutions() {
    return [{ name: "Mock ASPSP", country: "CZ", psuTypes: ["business", "personal"] }];
  },
  async startAuthorization({ redirectUrl, state }) {
    return {
      url: `${redirectUrl}?code=${encodeURIComponent(`mock-${state}`)}&state=${encodeURIComponent(state)}`,
      externalAuthorizationId: `mock-${state}`,
    };
  },
  async completeAuthorization({ code }) {
    const suffix = shortHash(code);
    return {
      sessionId: `mock-session-${suffix}`,
      accounts: [{
        externalAccountId: `mock-account-${suffix}`,
        externalSessionId: `mock-session-${suffix}`,
        identificationHash: `mock-identification-${suffix}`,
        iban: `CZ650800000000${suffix.replace(/[^0-9]/g, "").padEnd(10, "0").slice(0, 10)}`,
        name: "Testovací účet nájemného",
        currency: "CZK",
      }],
    };
  },
  async sync(account) {
    const prefix = account.externalAccountId;
    const today = new Date();
    const bookedAt = (daysAgo: number) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), Math.max(1, today.getUTCDate() - daysAgo), 12));
    return [
      {
        externalId: `${prefix}-rent-1001`,
        bookedAt: bookedAt(3),
        amountCents: 1650000,
        currency: "CZK",
        counterpartyName: "Jan Novák",
        counterpartyIban: "CZ1208000000001234567899",
        variableSymbol: "1001",
        message: "Nájemné a služby, VS 1001",
      },
      {
        externalId: `${prefix}-own-transfer`,
        bookedAt: bookedAt(2),
        amountCents: 450000,
        currency: "CZK",
        counterpartyName: "Vlastní spořicí účet",
        counterpartyIban: "CZ5508000000009876543210",
        message: "Převod mezi vlastními účty",
      },
      {
        externalId: `${prefix}-unknown-payment`,
        bookedAt: bookedAt(1),
        amountCents: 1200000,
        currency: "CZK",
        counterpartyName: "Petra Malá",
        counterpartyIban: "CZ4301000000001111222233",
        message: "Platba za byt",
      },
      {
        externalId: `${prefix}-bank-fee`,
        bookedAt: bookedAt(0),
        amountCents: -12900,
        currency: "CZK",
        counterpartyName: "Banka",
        message: "Poplatek za vedení účtu",
      },
    ];
  },
  async balance() {
    return { amountCents: 42850000, currency: "CZK" };
  },
};
