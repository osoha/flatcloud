import type {ContractFacts,ContractSupplement} from "../lib/lease-contract/model";
export const contractFacts:ContractFacts={
  tenantName:"TEST Jan Karel Dvořák",tenantDateOfBirth:"1990-03-12",tenantType:"PERSON",unitType:"APARTMENT",unitLabel:"Byt 12",
  unitAddress:"Testovací 125, 301 00 Plzeň",areaM2:62.5,startDate:"2026-11-01",endDate:"2027-10-31",dueDay:5,currency:"CZK",
  rentCents:1500000,servicesCents:260050,depositCents:3000000,depositRateBps:275,bankAccount:"123456789/0800",variableSymbol:"123412",
  indexationEnabled:false,contractingParties:1,hasScheduledFinanceChanges:false,
};
export const contractSupplement:ContractSupplement={
  landlordName:"TEST Marie Nováková",landlordKind:"PERSON",landlordId:"1. 2. 1970",landlordAddress:"Testovací 10, 301 00 Plzeň",
  landlordEmail:"pronajimatel@flatcloud.test",landlordPhone:"+420 000 000 000",landlordRegistration:"",representative:"TEST Marie Nováková, osobně",
  managerName:"TEST Správa",managerEmail:"sprava@flatcloud.test",managerPhone:"+420 000 000 001",tenantAddress:"Testovací 20, 301 00 Plzeň",
  tenantDeliveryAddress:"Testovací 125, 301 00 Plzeň",tenantEmail:"najemce@flatcloud.test",tenantPhone:"+420 000 000 002",
  floor:"2. nadzemní podlaží, vlevo",disposition:"2+1",cadastralId:"Jednotka 125/12, parcela 200/1, k. ú. Testovací, LV 100",
  accessories:"Sklep č. 12 o ploše 3 m²; vybavení dle předávacího protokolu",handoverDate:"2026-11-01",firstPaymentDate:"2026-11-05",depositDueDate:"2026-10-30",
  directEnergy:"elektřinu a plyn",peopleCount:2,attachments:"Žádné",signingPlace:"Plzni",signingDate:"2026-10-20",
  services:[{name:"Studená voda a stočné",amountCents:90000},{name:"Teplo",amountCents:140050},{name:"Úklid společných prostor",amountCents:30000}],confirmedTestRecord:true,
};
