import { enableBankingProvider } from "./enablebanking";
import { mockBankingProvider } from "./mock";
import type { BankingProvider } from "./types";

export function bankingProvider(provider = process.env.BANKING_PROVIDER || "enablebanking"): BankingProvider {
  if (provider === "mock") return mockBankingProvider;
  if (provider === "enablebanking") return enableBankingProvider;
  throw new Error(`Neznámý bankovní poskytovatel: ${provider}`);
}

export function bankingConfiguration() {
  const provider = bankingProvider();
  return { provider: provider.key, configured: provider.configured() };
}
