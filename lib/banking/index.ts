import { mockBankingProvider } from "./mock";
export function bankingProvider(){
  switch(process.env.BANKING_PROVIDER){ case "mock": default:return mockBankingProvider; }
}
