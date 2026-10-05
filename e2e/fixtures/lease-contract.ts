import type { ContractInput } from "../../lib/lease-contracts/core";
export const leaseContractFixture:ContractInput={
  term:"SHORT_FIXED",tenancy:"SINGLE",landlord:{type:"PERSON",name:"Anna Pronajímatelová",identifier:"1975-06-14",address:"Lipová 12, 110 00 Praha",email:"anna@example.test",phone:"+420 777 111 222",registry:"",signer:"Anna Pronajímatelová",authority:"osobně",represented:false},
  tenants:[{name:"Jan Nájemník",birthDate:"1995-05-10",address:"Lipová 15, Praha",deliveryAddress:"Jabloňová 25, 120 00 Praha",email:"jan@example.test",phone:"+420 777 333 444"}],manager:{name:"Správa domů",email:"sprava@example.test",phone:"+420 777 555 666"},
  unit:{address:"Jabloňová 25, 120 00 Praha",label:"Byt 12",floor:"3. nadzemní podlaží",disposition:"2+kk",areaM2:54.5,cadastral:"Jednotka 125/12, budova č. p. 125, parcela 425/1, k. ú. Vinohrady, LV 2045",accessories:"Sklep S12; balkon; společné části domu"},
  startDate:"2026-11-01",endDate:"2027-10-31",handoverDate:"2026-11-01",signingDate:"2026-10-20",signingPlace:"Praha",rentCents:1500000,
  services:[{name:"Studená voda a stočné",amountCents:65000},{name:"Teplo",amountCents:115000},{name:"Úklid společných prostor",amountCents:20000}],dueDay:5,account:"123456789/0800",variableSymbol:"100012",firstPaymentDate:"2026-11-05",depositCents:3000000,depositDueDate:"2026-10-25",depositAnnualRateBps:150,directEnergy:"elektřinu",occupantCount:1,attachments:"Žádné",confirmed:true,
};
