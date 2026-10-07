import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { bankEditableUnitScope, bankAccountReadScope, type BankActor } from "./bank-account-permissions";
import { businessDateKey, businessDateKeyToInstant, type BusinessDateKey } from "./calendar";
import { leaseStatusAt } from "./lease-lifecycle-core";
import { ownerBankAccountLabel } from "./owner-bank-account";
import { assertUniqueVariableSymbol } from "./variable-symbol";
import { bankAccountNoticePdf } from "./bank-account-notice-pdf";
import { publishTenantAnnouncementNotification } from "./tenant-portal-notifications";

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const include = { ownerships: { include: { owner: true, ownerBankAccount: true } }, property: true,
  leases: { include: { tenant: true, parties: { include: { tenant: true } }, ownerBankAccount: true }, orderBy: { id: "asc" as const } } } satisfies Prisma.UnitInclude;
type Unit = Prisma.UnitGetPayload<{include: typeof include}>;
function liveLeases(unit: Unit, now = new Date()) { return unit.leases.filter(l => leaseStatusAt(l, now) !== "ENDED"); }
function leaseRevision(l: Unit["leases"][number]) { return hash({id:l.id,accountId:l.ownerBankAccountId,vs:l.variableSymbol,tenantId:l.tenantId,parties:l.parties.map(p=>({id:p.tenantId,role:p.role})).sort((a,b)=>a.id.localeCompare(b.id)),start:l.startDate,end:l.endDate,terminatedOn:l.terminatedOn,cancelledAt:l.cancelledAt}); }
export function bankUnitRevision(unit: Unit) {
  return hash({ownerships:unit.ownerships.map(o=>({id:o.id,ownerId:o.ownerId,accountId:o.ownerBankAccountId})),leases:liveLeases(unit).map(leaseRevision)});
}
export async function changeableBankUnits(user: BankActor) {
  return prisma.unit.findMany({where:bankEditableUnitScope(user),include,orderBy:{label:"asc"}});
}
export type BankChangeInput = { requestId:string; accountId:string; unitIds:string[]; effectiveDate:string; reason:string; revisions:Record<string,string>; confirmed:boolean; noticeAllowed:boolean };

// Competing page loads can observe the same due change. Retry the whole
// serializable transaction; notices and audit rows are committed atomically.
async function bankTransaction<T>(work:(tx:Prisma.TransactionClient)=>Promise<T>,timeout:number):Promise<T>{
  for(let attempt=0;;attempt++){
    try{return await prisma.$transaction(work,{timeout,maxWait:10000,isolationLevel:Prisma.TransactionIsolationLevel.Serializable});}
    catch(error){if(!(error instanceof Prisma.PrismaClientKnownRequestError)||error.code!=="P2034"||attempt>=3)throw error;}
  }
}

async function lock(tx: Prisma.TransactionClient) { await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended('flatberry:bank-account-changes',0))`; }

async function notice(tx: Prisma.TransactionClient, change: {id:string;actorId:string;ownerId:string;effectiveAt:Date;reason:string;account:{accountNumber:string|null;bankCode:string|null;iban:string|null;label:string|null;currency:string}}, unit:Unit, lease:Unit["leases"][number], kind="CHANGE", original?:{body:string;tenantIds:string[]}) {
  const id=randomUUID(), announcementId=`bank-change:${id}`;
  const title=kind==="CANCEL"?"Zrušení oznámené změny platebních údajů":"Oznámení o změně platebních údajů";
  const people=[lease.tenant,...lease.parties.filter(p=>p.role==="CONTRACTING_PARTY").map(p=>p.tenant)];
  const tenantIds=original?.tenantIds||[...new Set(people.map(p=>p.id))];
  const actor=await tx.user.findUniqueOrThrow({where:{id:change.actorId},select:{name:true}});
  const body=original?`Oznámená změna platebních údajů se ruší. Pokud jste upravili trvalý příkaz, kontaktujte správce pro potvrzení aktuálních platebních pokynů.\n\nPůvodní oznámení, jehož změna se ruší:\n\n${original.body}\n\nZrušení vystavil: ${actor.name}\nVystaveno: ${businessDateKey(new Date())}`:[`Smlouva: ${lease.contractNumber||lease.id}`,`Jednotka: ${unit.property.name} - ${unit.label}`,`Nájemci: ${[...new Set(people.map(p=>p.name))].join(", ")}`,
    kind==="CANCEL"?`Změna oznámená s účinností od ${businessDateKey(change.effectiveAt)} se ruší. Nadále používejte dosavadní platební účet.`:`Od ${businessDateKey(change.effectiveAt)} používejte pro další úhrady nájemného, záloh i dosavadních nedoplatků níže uvedený účet.`,
    `Dosavadní účet: ${lease.ownerBankAccount?ownerBankAccountLabel(lease.ownerBankAccount):"Dosud nenastaven"}`,
    ...(kind==="CANCEL"?[]:[`Nový účet: ${ownerBankAccountLabel(change.account)}`]),`Variabilní symbol: ${lease.variableSymbol}`,
    "Výše nájemného, záloh a sjednané splatnosti se tímto oznámením nemění.",
    kind==="CANCEL"?"Pokud jste již upravili trvalý příkaz, vraťte jej na dosavadní účet.":"Upravte prosím trvalý příkaz a potvrďte přečtení oznámení v portálu.",
    `Podklad změny: ${change.reason}`,`Vystavil: ${actor.name}`,`Vystaveno: ${businessDateKey(new Date())}`].join("\n\n");
  const pdfData=await bankAccountNoticePdf(title,body,id);
  await tx.bankAccountNotice.create({data:{id,changeId:change.id,leaseId:lease.id,kind,title,body,pdfData,pdfHash:createHash("sha256").update(pdfData).digest("hex"),snapshot:json({title,body,account:change.account,effectiveAt:change.effectiveAt,tenantIds}),tenantIds,announcementId}});
  await tx.announcement.create({data:{id:announcementId,title,body,createdById:change.actorId,audiences:{create:{kind:"TENANT_LEASE",leaseId:lease.id}}}});
  await publishTenantAnnouncementNotification(tx,announcementId);
  // A tracked delivery task also covers people without portal access and failed mail delivery.
  await tx.task.create({data:{title:`Doručení: ${title} - ${unit.label}`,description:`Ověřte doručení všem smluvním nájemcům. PDF a potvrzení najdete u změny účtu /bankovni-ucty/zmeny/${change.id}. Bez portálu doručte písemně a připojte doklad k tomuto úkolu.`,propertyId:unit.propertyId,unitId:unit.id,leaseId:lease.id,tenantId:lease.tenantId,createdById:change.actorId,assigneeId:unit.property.managerId||change.actorId,dueAt:change.effectiveAt,dedupeKey:`bank-notice:${id}`}});
  await tx.auditLog.create({data:{userId:change.actorId,propertyId:unit.propertyId,entityType:"Lease",entityId:lease.id,action:kind==="CANCEL"?"LEASE_BANK_CHANGE_CANCELLED":"LEASE_BANK_CHANGE_ANNOUNCED",details:json({changeId:change.id,noticeId:id,pdfHash:createHash("sha256").update(pdfData).digest("hex"),effectiveAt:change.effectiveAt,oldAccountId:lease.ownerBankAccountId,newAccount:change.account,reason:change.reason})}});
}

export async function scheduleBankAccountChange(user: BankActor,input:BankChangeInput) {
  if(!input.confirmed||!input.noticeAllowed)throw new Error("Potvrďte dopad změny a možnost oznámit ji podle dotčených smluv.");
  if(!/^[a-f0-9-]{36}$/i.test(input.requestId))throw new Error("Obnovte formulář změny.");
  if(!input.reason.trim()||input.reason.length>2000)throw new Error("Doplňte důvod a podklad změny do 2 000 znaků.");
  const ids=[...new Set(input.unitIds)].sort();
  if(!ids.length||ids.length>100)throw new Error("Vyberte 1 až 100 jednotek.");
  const effectiveAt=businessDateKeyToInstant(input.effectiveDate as BusinessDateKey);
  if(businessDateKey(effectiveAt)!==input.effectiveDate||input.effectiveDate<businessDateKey(new Date()))throw new Error("Datum účinnosti musí být dnešní nebo budoucí.");
  const fingerprint=hash({...input,unitIds:ids,actorId:user.id});
  const result=await bankTransaction(async tx=>{
    await lock(tx);
    const previous=await tx.bankAccountChange.findUnique({where:{id:input.requestId}});
    if(previous){if(previous.fingerprint!==fingerprint)throw new Error("Požadavek už byl použit pro jinou změnu.");return previous;}
    const actor=await tx.user.findFirst({where:{id:user.id,active:true},select:{id:true,role:true}});
    if(!actor||actor.role==="TENANT")throw new Error("Aktuální uživatel nemá oprávnění ke změně účtu.");
    const account=await tx.ownerBankAccount.findFirst({where:{id:input.accountId,active:true,usageState:"AVAILABLE",AND:[bankAccountReadScope(actor),{owner:{active:true}}]}});
    if(!account)throw new Error("Vybraný účet není dostupný pro nové platební pokyny.");
    if(!account.notificationVerifiedAt)throw new Error("Nejprve ověřte bankovní notifikace nového účtu.");
    const units=await tx.unit.findMany({where:{id:{in:ids},...bankEditableUnitScope(actor)},include,orderBy:{id:"asc"}});
    if(units.length!==ids.length)throw new Error("Některá jednotka není ve vašem oprávněném rozsahu.");
    if(await tx.bankAccountChangeUnit.count({where:{unitId:{in:ids},change:{status:{in:["SCHEDULED","BLOCKED"]}}}}))throw new Error("Jednotka již má naplánovanou změnu. Nejprve ji zrušte nebo vyřešte.");
    for(const unit of units){
      if(unit.ownerships.length!==1||unit.ownerships[0].ownerId!==account.ownerId)throw new Error("Účet musí patřit jednoznačně určenému vlastníkovi všech vybraných jednotek.");
      if(bankUnitRevision(unit)!==input.revisions[unit.id])throw new Error("Účet nebo smlouva se mezitím změnily. Obnovte přehled dopadů.");
      if(unit.ownerships[0].ownerBankAccountId===account.id&&liveLeases(unit).every(l=>l.ownerBankAccountId===account.id))throw new Error("Jednotka již používá vybraný účet.");
      for(const lease of liveLeases(unit)){
        await assertUniqueVariableSymbol(tx,account.id,lease.variableSymbol,lease.id);
        await tx.leaseReceiptAccount.upsert({where:{leaseId_accountId:{leaseId:lease.id,accountId:account.id}},create:{leaseId:lease.id,accountId:account.id,variableSymbol:lease.variableSymbol},update:{}});
        if(lease.ownerBankAccountId)await tx.leaseReceiptAccount.upsert({where:{leaseId_accountId:{leaseId:lease.id,accountId:lease.ownerBankAccountId}},create:{leaseId:lease.id,accountId:lease.ownerBankAccountId,variableSymbol:lease.variableSymbol},update:{}});
      }
    }
    const change=await tx.bankAccountChange.create({data:{id:input.requestId,fingerprint,ownerId:account.ownerId,accountId:account.id,actorId:user.id,effectiveAt,reason:input.reason.trim(),units:{create:units.map(unit=>({unitId:unit.id,expectedAccountId:unit.ownerships[0].ownerBankAccountId,expectedLeases:json(liveLeases(unit).map(l=>({id:l.id,accountId:l.ownerBankAccountId,revision:leaseRevision(l)})))}))}},include:{account:true}});
    for(const unit of units){
      await tx.propertyPaymentAccount.upsert({where:{propertyId_ownerBankAccountId:{propertyId:unit.propertyId,ownerBankAccountId:account.id}},create:{propertyId:unit.propertyId,ownerBankAccountId:account.id},update:{active:true}});
      for(const lease of liveLeases(unit))await notice(tx,change,unit,lease);
      const ownerUser=unit.ownerships[0].owner.userId;
      const recipients=[...new Set([ownerUser,unit.property.managerId,user.id].filter((id):id is string=>Boolean(id)))];
      await tx.announcement.create({data:{title:`Změna účtu pro nájemné - ${unit.label}`,body:`${unit.property.name}: od ${input.effectiveDate} účet ${ownerBankAccountLabel(account)}. Přehled: /bankovni-ucty/zmeny/${change.id}`,createdById:user.id,audiences:{create:recipients.map(userId=>({kind:"USER" as const,userId}))}}});
    }
    return change;
  },120000);
  await applyDueBankAccountChanges();
  return result;
}

export async function applyDueBankAccountChanges(now=new Date()) {
  const rows=await prisma.bankAccountChange.findMany({where:{status:"SCHEDULED",effectiveAt:{lte:now}},select:{id:true},orderBy:{effectiveAt:"asc"},take:100});
  for(const row of rows)await bankTransaction(async tx=>{
    await lock(tx);
    const change=await tx.bankAccountChange.findUnique({where:{id:row.id},include:{account:true,units:true}});
    if(!change||change.status!=="SCHEDULED")return;
    const units=await tx.unit.findMany({where:{id:{in:change.units.map(u=>u.unitId)}},include});
    const actor=await tx.user.findFirst({where:{id:change.actorId,active:true},select:{id:true,role:true}});
    const permitted=actor?await tx.unit.count({where:{id:{in:change.units.map(u=>u.unitId)},...bankEditableUnitScope(actor)}}):0;
    let conflict=permitted!==change.units.length||units.length!==change.units.length||units.some(unit=>{
      const expected=change.units.find(u=>u.unitId===unit.id)!;
      const leases=expected.expectedLeases as Array<{id:string;accountId:string|null;revision:string}>;
      return unit.ownerships.length!==1||unit.ownerships[0].ownerId!==change.ownerId||unit.ownerships[0].ownerBankAccountId!==expected.expectedAccountId||liveLeases(unit,now).length!==leases.length||liveLeases(unit,now).some(l=>!leases.some(e=>e.id===l.id&&e.accountId===l.ownerBankAccountId&&e.revision===leaseRevision(l)));
    });
    if(!conflict){
      try{for(const unit of units)for(const lease of liveLeases(unit,now))await assertUniqueVariableSymbol(tx,change.accountId,lease.variableSymbol,lease.id);}
      catch(error){if(error instanceof Error&&error.message.startsWith("Variabilní symbol"))conflict=true;else throw error;}
    }
    if(conflict||!change.account.active||!change.account.notificationVerifiedAt||change.account.usageState!=="AVAILABLE"){
      await tx.bankAccountChange.update({where:{id:change.id},data:{status:"BLOCKED",failure:"Vlastnictví, účet nebo okruh smluv se po oznámení změnily. Zrušte změnu a připravte nový přehled."}});
      await tx.task.upsert({where:{dedupeKey:`bank-change-blocked:${change.id}`},create:{dedupeKey:`bank-change-blocked:${change.id}`,title:"Změna platebního účtu vyžaduje kontrolu",description:`Otevřete /bankovni-ucty/zmeny/${change.id}. Nájemníci již mohli obdržet oznámení; zajistěte navazující sdělení.`,createdById:change.actorId,assigneeId:change.actorId,priority:"HIGH"},update:{}});return;
    }
    for(const unit of units){
      await tx.unitOwnership.update({where:{id:unit.ownerships[0].id},data:{ownerBankAccountId:change.accountId}});
      for(const lease of liveLeases(unit,now)){
        await tx.lease.update({where:{id:lease.id},data:{ownerBankAccountId:change.accountId}});
        await tx.auditLog.create({data:{userId:change.actorId,propertyId:unit.propertyId,entityType:"Lease",entityId:lease.id,action:"LEASE_BANK_CHANGE_EFFECTIVE",details:json({changeId:change.id,before:lease.ownerBankAccountId,after:change.accountId,effectiveAt:change.effectiveAt})}});
      }
    }
    await tx.bankAccountChange.update({where:{id:change.id},data:{status:"APPLIED",appliedAt:now}});
  },30000);
  return rows.length;
}

export async function cancelBankAccountChange(user:BankActor,id:string){
  return bankTransaction(async tx=>{
    await lock(tx);
    const change=await tx.bankAccountChange.findUnique({where:{id},include:{account:true,units:true}});
    if(!change)throw new Error("Změna není dostupná.");
    const units=await tx.unit.findMany({where:{id:{in:change.units.map(u=>u.unitId)},...bankEditableUnitScope(user)},include});
    if(units.length!==change.units.length)throw new Error("Nemáte oprávnění ke všem dotčeným jednotkám.");
    if(change.status==="CANCELLED")return;
    if(!["SCHEDULED","BLOCKED"].includes(change.status))throw new Error("Účinnou změnu nelze vymazat. Připravte novou změnu účtu.");
    const originals=await tx.bankAccountNotice.findMany({where:{changeId:id,kind:"CHANGE"}});
    for(const original of originals){const unit=units.find(u=>u.leases.some(l=>l.id===original.leaseId));const lease=unit?.leases.find(l=>l.id===original.leaseId);if(unit&&lease)await notice(tx,{...change,actorId:user.id},unit,lease,"CANCEL",original);}
    await tx.bankAccountChange.update({where:{id},data:{status:"CANCELLED",cancelledAt:new Date()}});
  },120000);
}
