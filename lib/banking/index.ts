import { csasProvider } from "./csas";
import { enableBankingProvider } from "./enablebanking";
import { mockBankingProvider } from "./mock";
import type { BankingProvider } from "./types";

const providers: Record<string, BankingProvider> = {
  "csas-premium": csasProvider,
  enablebanking: enableBankingProvider,
  mock: mockBankingProvider,
};

export function bankingProvider(provider = process.env.BANKING_PROVIDER || "csas-premium"): BankingProvider {
  const found = providers[provider];
  if (!found) throw new Error(`Neznámý bankovní poskytovatel: ${provider}`);
  return found;
}

export function availableBankingProviders() {
  const order = [csasProvider, enableBankingProvider, ...(process.env.BANKING_PROVIDER === "mock" ? [mockBankingProvider] : [])];
  return order.map((provider) => ({ key: provider.key, label: provider.label, direct: provider.direct, configured: provider.configured() }));
}

export function bankingConfiguration(providerKey?: string) {
  const provider = bankingProvider(providerKey);
  return { provider: provider.key, label: provider.label, direct: provider.direct, configured: provider.configured() };
}
