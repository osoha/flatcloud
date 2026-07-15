export type IncomingTransaction = {
  externalId: string;
  bookedAt: Date;
  amountCents: number;
  currency: string;
  counterpartyName?: string;
  counterpartyIban?: string;
  variableSymbol?: string;
  message?: string;
};

export type BankInstitution = {
  name: string;
  country: string;
  logo?: string;
  psuTypes: string[];
  maximumConsentValidity?: number;
};

export type ConnectedBankAccount = {
  externalAccountId: string;
  externalSessionId: string;
  identificationHash?: string;
  iban?: string;
  name?: string;
  currency: string;
};

export type AuthorizationStart = {
  url: string;
  externalAuthorizationId?: string;
};

export interface BankingProvider {
  key: string;
  configured(): boolean;
  listInstitutions(country: string): Promise<BankInstitution[]>;
  startAuthorization(input: {
    bankName: string;
    country: string;
    psuType: string;
    state: string;
    redirectUrl: string;
    psuIp?: string;
    userAgent?: string;
  }): Promise<AuthorizationStart>;
  completeAuthorization(input: {
    code: string;
    psuIp?: string;
    userAgent?: string;
  }): Promise<{ sessionId: string; accounts: ConnectedBankAccount[] }>;
  sync(account: { externalAccountId: string; lastSyncedAt?: Date | null }): Promise<IncomingTransaction[]>;
  balance(account: { externalAccountId: string }): Promise<{ amountCents: number; currency: string } | null>;
}
