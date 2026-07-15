export type IncomingTransaction={externalId:string;bookedAt:Date;amountCents:number;currency:string;counterpartyName?:string;counterpartyIban?:string;variableSymbol?:string;message?:string};
export interface BankingProvider { sync(account:{externalAccountId:string}):Promise<IncomingTransaction[]> }
