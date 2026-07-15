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

export type ProviderCredentials = Record<string, string | number | boolean | null>;

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
  context?: ProviderCredentials;
};

export type SyncOptions = {
  dateFrom?: Date;
  dateTo?: Date;
  strategy?: "default" | "longest";
};

export type ProviderAccount = {
  id: string;
  externalAccountId: string;
  externalSessionId?: string | null;
  lastSyncedAt?: Date | null;
  credentials?: ProviderCredentials;
};

export type ProviderSyncResult = {
  transactions: IncomingTransaction[];
  balance?: { amountCents: number; currency: string } | null;
  credentials?: ProviderCredentials;
};

export interface BankingProvider {
  key: string;
  label: string;
  direct: boolean;
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
    redirectUrl: string;
    context?: ProviderCredentials;
    psuIp?: string;
    userAgent?: string;
  }): Promise<{
    sessionId: string;
    accounts: ConnectedBankAccount[];
    credentials?: ProviderCredentials;
    consentExpiresAt?: Date;
  }>;
  sync(account: ProviderAccount, options?: SyncOptions): Promise<ProviderSyncResult>;
}
