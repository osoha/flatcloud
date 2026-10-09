// Historical one-off production transfer for the two named REpilot lease views.
// The private source manifest stays outside this public repository. This script
// requires the pre-import state and cannot be replayed against the imported leases.
// Dry run is the default; set APPLY=1 only after a backup and reconciliation.
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const source = JSON.parse(fs.readFileSync('/tmp/moskevska_repilot_source.json', 'utf8'));
const config = {
  diestra: { leaseId: 'cmumrtbhh0003kb2ajvqcmg9v', tenant: 'Diestra' },
  nipama: { leaseId: 'cmums8xio001okb2aei3r6tdg', tenant: 'NIPAMA' },
};
const bankAccountId = 'cmrnj2391001nmg2dl1jtchff';
const at = day => new Date(day + 'T12:00:00.000Z');
const sum = arr => arr.reduce((a,b)=>a+b,0);
const assert = (x,msg) => { if (!x) throw Error(msg); };

function plan(k) {
  const data = source[k];
  const bills = data.bills.map(row => {
    const [id,title,due,rent,services,total,paid,status,note] = row;
    const exceptional = !/^\d{4}-\d{2}$/.test(due.slice(0,7)) || title.startsWith('Jednorázové');
    const period = exceptional ? (total < 0 ? '2025-09-refund-repilot' : '2025-05-energy-repilot') : due.slice(0,7);
    assert(rent+services===total,`${k} ${id}: bill components`);
    return {id,title,due,rent,services,total,paid,status,note,period,exceptional};
  });
  assert(new Set(bills.map(x=>x.period)).size===bills.length,`${k}: duplicate periods`);
  const records = data.records.map(([id,day,type,amount,note])=>({id,day,type,amount,note}));
  assert(new Set(records.map(x=>x.id)).size===records.length,`${k}: duplicate source records`);
  const allocations=[]; const credits=[]; const refund=[];
  for (const r of records) {
    if (r.type==='vyrovnání přeplatku') { refund.push(r); continue; }
    assert(r.type==='nájem',`${k}: unknown record type ${r.type}`);
    const period=r.day.slice(0,7);
    if(k==='diestra' && r.note.includes('Zápočet do nájmu')) {
      assert(r.amount===500000 && ['2025-04','2025-05','2025-06'].includes(period),`Unexpected offset ${r.id}`);
      credits.push({record:r,period}); continue;
    }
    if(k==='nipama' && ['3waSpBzwVb67DOCOLYzx','98Ta5r4ZuTERBVl4NV9F'].includes(r.id)) {
      allocations.push({record:r,period:'2025-05-energy-repilot',amount:r.amount}); continue;
    }
    if(k==='nipama' && r.id==='6xBZPcOh_ZYNEeynKZYb') {
      allocations.push({record:r,period:'2025-08',amount:1510000});
      allocations.push({record:r,period:'2026-10',amount:50000}); continue;
    }
    if(k==='diestra' && r.id==='8UoYcmOOpvOHQDV-q2eS') {
      allocations.push({record:r,period:'2026-05',amount:890000});
      allocations.push({record:r,period:'2026-10',amount:210000}); continue;
    }
    allocations.push({record:r,period,amount:r.amount});
  }
  for(const b of bills) {
    const allocated=sum(allocations.filter(a=>a.period===b.period).map(a=>a.amount));
    const credited=sum(credits.filter(c=>c.period===b.period).map(c=>c.record.amount));
    if(b.total<0) { assert(b.paid===b.total&&refund.length===1&&refund[0].amount===-b.total,`${k}: refund bill`); continue; }
    assert(allocated+credited===b.paid,`${k} ${b.period}: expected paid ${b.paid}, mapped ${allocated}+${credited}`);
    assert(b.status==='paid' ? b.paid===b.total : b.status==='inactive' ? b.paid===0 : b.paid<=b.total,`${k} ${b.period}: status`);
  }
  for(const r of records.filter(x=>x.type==='nájem'&&!credits.some(c=>c.record.id===x.id)))
    assert(sum(allocations.filter(a=>a.record.id===r.id).map(a=>a.amount))===r.amount,`${k}: payment ${r.id} not fully mapped`);
  assert(k!=='nipama'||refund.length===1&&refund[0].amount===2485600,'NIPAMA refund');
  assert(k!=='diestra'||refund.length===0,'Diestra refund');
  const timeline=[];
  for(const b of bills.filter(x=>!x.exceptional).sort((a,b)=>a.period.localeCompare(b.period))) {
    const last=timeline.at(-1);
    if(!last||last.amount!==b.rent) timeline.push({from:b.period,to:b.period,amount:b.rent});
    else last.to=b.period;
  }
  assert(timeline[0]?.from===(k==='diestra'?'2025-01':'2024-08'),`${k}: rent timeline start`);
  return {bills,records,allocations,credits,refund,timeline};
}

async function run(){
 const plans=Object.fromEntries(Object.keys(config).map(k=>[k,plan(k)]));
 const bank=await db.bankAccount.findUnique({where:{id:bankAccountId},include:{property:true}});
 assert(bank?.property?.name==='Moskevská'&&bank.provider==='manual','Unexpected bank account');
 for(const [k,cfg] of Object.entries(config)) {
   const lease=await db.lease.findUnique({where:{id:cfg.leaseId},include:{unit:{include:{property:true}},charges:{include:{items:true,allocations:true,creditApplications:true}},paymentItems:true}});
   assert(lease?.unit?.property?.name==='Moskevská'&&!lease.autoChargesEnabled,`${k}: wrong lease`);
   assert(lease.charges.length===1&&lease.charges[0].period==='2026-10'&&lease.charges[0].allocations.length===0,`${k}: target not pristine`);
   const rentItems=lease.paymentItems.filter(x=>x.category==='RENT');
   assert(rentItems.length===(k==='diestra'?1:2)&&lease.paymentItems.filter(x=>x.category==='SERVICES').length===1,`${k}: existing payment items changed`);
   const oct=plans[k].bills.find(x=>x.period==='2026-10');
   assert(lease.charges[0].amountCents===oct.total,`${k}: October amount mismatch`);
   console.log(JSON.stringify({tenant:k,bills:plans[k].bills.length,records:plans[k].records.length,cashTransactions:new Set(plans[k].allocations.map(x=>x.record.id)).size,noncashCredits:plans[k].credits.length,refundRecords:plans[k].refund.length,octoberPaid:oct.paid,existingCharge:lease.charges[0].id}));
 }
 if(process.env.APPLY!=='1'){console.log('DRY RUN OK; NO WRITES'); return;}
 await db.$transaction(async tx=>{
  for(const [k,cfg] of Object.entries(config)){
   const p=plans[k]; const chargeIds={};
   for(const b of p.bills){
    const itemData=b.total<0 ? [{name:'Vyúčtování záloh 2024 dle REpilot',category:'ADJUSTMENT',amountCents:b.total}]
      : b.exceptional ? [{name:'Vyúčtování elektřiny dle REpilot',category:'ELECTRICITY',amountCents:b.total}] : [
      ...(b.rent ? [{name:'Nájemné',category:'RENT',amountCents:b.rent}] : []),
      ...(b.services ? [{name:'Služby',category:'SERVICES',amountCents:b.services}] : [])];
    const data={dueDate:at(b.due),amountCents:b.total,active:b.status!=='inactive',manualOverride:true,
      debtTreatment:b.due<'2026-10-01'?'HISTORICAL':'CURRENT',note:`REpilot předpis ${b.id}; ${b.title}${b.note?' ; '+b.note:''}`};
    let charge;
    if(b.period==='2026-10'){
      charge=await tx.charge.update({where:{leaseId_period:{leaseId:cfg.leaseId,period:b.period}},data:{...data,items:{deleteMany:{},create:itemData}}});
    }else charge=await tx.charge.create({data:{leaseId:cfg.leaseId,period:b.period,...data,items:{create:itemData}}});
    chargeIds[b.period]=charge.id;
   }
   for(const r of p.records.filter(x=>x.type==='nájem'&&!p.credits.some(c=>c.record.id===x.id))){
     const t=await tx.bankTransaction.create({data:{bankAccountId,externalId:`repilot:${r.id}`,bookedAt:at(r.day),amountCents:r.amount,
       counterpartyName:cfg.tenant,source:'repilot_import',status:'MATCHED',suggestedLeaseId:cfg.leaseId,
       message:r.note||`REpilot ${r.type}`,matchNote:`REpilot záznam ${r.id}`}});
     for(const a of p.allocations.filter(x=>x.record.id===r.id))
       await tx.paymentAllocation.create({data:{transactionId:t.id,chargeId:chargeIds[a.period],amountCents:a.amount}});
   }
   for(const c of p.credits){
     await tx.leaseCredit.create({data:{leaseId:cfg.leaseId,type:'MANUAL_ADJUSTMENT',amountCents:c.record.amount,effectiveAt:at(c.record.day),
       description:'Zápočet na novou podlahu dle REpilot',note:`REpilot záznam ${c.record.id}: ${c.record.note}`,
       applications:{create:{chargeId:chargeIds[c.period],amountCents:c.record.amount,effectiveAt:at(c.record.day)}}}});
   }
   if(k==='nipama'){
     const r=p.refund[0];
     const refundBill=p.bills.find(b=>b.total<0);
     const outward=await tx.bankTransaction.create({data:{bankAccountId,externalId:`repilot:${r.id}`,bookedAt:at(r.day),amountCents:-r.amount,
       counterpartyName:cfg.tenant,source:'repilot_import',status:'MATCHED',suggestedLeaseId:cfg.leaseId,
       message:'Vratka přeplatku vyúčtování záloh 2024',matchNote:`REpilot záznam ${r.id}; předpis ${refundBill.id}`}});
     await tx.paymentAllocation.create({data:{transactionId:outward.id,chargeId:chargeIds[refundBill.period],amountCents:-r.amount}});
   }
   await tx.leasePaymentItem.deleteMany({where:{leaseId:cfg.leaseId,category:'RENT'}});
   for(let i=0;i<p.timeline.length;i++){
     const segment=p.timeline[i],next=p.timeline[i+1];
     const validTo=next?new Date(Date.UTC(+next.from.slice(0,4),+next.from.slice(5,7)-1,0,12)):null;
     await tx.leasePaymentItem.create({data:{leaseId:cfg.leaseId,name:'Nájemné',category:'RENT',amountCents:segment.amount,
       validFrom:at(segment.from+'-01'),validTo,active:true,sortOrder:10}});
   }
  }
 },{timeout:120000,maxWait:10000});
 console.log('APPLY COMPLETE');
}
run().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
