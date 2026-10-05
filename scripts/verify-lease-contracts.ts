import assert from "node:assert/strict";
import { mkdir,writeFile } from "node:fs/promises";
import { buildContract,contractInputSchema,firstIndexationDate,type ContractInput } from "../lib/lease-contracts/core";
import { contractPdf } from "../lib/lease-contracts/pdf";
import { leaseContractFixture } from "../e2e/fixtures/lease-contract";
async function main(){
let checked=0;
const samples:ContractInput[]=[];
for(const term of ["SHORT_FIXED","LONG_FIXED","INDEFINITE"] as const)for(const type of ["PERSON","COMPANY"] as const)for(const represented of [false,true])for(const tenancy of ["SINGLE","JOINT","SPOUSES"] as const){
  const d=structuredClone(leaseContractFixture);d.term=term;d.endDate=term==="INDEFINITE"?"":term==="LONG_FIXED"?"2029-10-31":"2027-10-31";
  d.landlord.type=type;d.landlord.represented=represented;
  if(type==="COMPANY"){d.landlord.name="Brickflow QA s.r.o.";d.landlord.identifier="12345678";d.landlord.registry="Městský soud v Praze, oddíl C, vložka 100012; jednatel samostatně";d.landlord.signer="Anna Pronajímatelová";d.landlord.authority="jednatelka, samostatně";}
  if(represented){d.landlord.signer="Petr Zástupce";d.landlord.authority="plná moc ze dne 15. 10. 2026";d.attachments="Plná moc ze dne 15. 10. 2026";}
  d.tenancy=tenancy;if(tenancy!=="SINGLE"){d.tenants.push({...d.tenants[0],name:"Jana Nájemníková",birthDate:"1994-04-11"});d.occupantCount=2;}
  const c=buildContract(d),text=c.sections.flatMap(s=>s.paragraphs).join("\n"),cover=c.cover.map(v=>v.join(": ")).join("\n");
  assert.equal(c.sections.length,10);assert.equal(c.signatures.length,d.tenants.length+1);assert(!/[\[\]]/.test(text+cover));
  assert(text.includes("17\u00a0000,00")||text.includes("17 000,00"));assert(cover.includes("17\u00a0000,00")||cover.includes("17 000,00"));
  assert(text.includes("1,5 % ročně"));assert(cover.includes("1,5 % ročně"));assert(text.includes("0,50 Kč nahoru")=== (term!=="SHORT_FIXED"));
  if(term==="INDEFINITE"){assert(!/prodlouž|uplynutím|2285/.test(text));assert(!text.includes("31. 10. 2027"));assert(text.includes("1. 4. 2028"));}
  else assert(text.includes("2285"));
  if(term==="SHORT_FIXED")assert(!text.includes("průměrná roční míra inflace"));
  if(tenancy!=="SINGLE"){assert(text.includes("Jana Nájemníková"));assert(text.includes("všemi nájemci"));}
  samples.push(d);checked++;
}
assert.equal(checked,36);
assert.equal(firstIndexationDate("2026-04-01"),"2027-04-01");assert.equal(firstIndexationDate("2026-04-02"),"2028-04-01");assert.equal(firstIndexationDate("2024-02-29"),"2025-04-01");
const invalid=(change:Partial<ContractInput>)=>assert(!contractInputSchema.safeParse({...structuredClone(leaseContractFixture),...change}).success);
invalid({depositCents:4500001});invalid({depositAnnualRateBps:null as unknown as number});invalid({firstPaymentDate:"2026-10-19"});invalid({endDate:"2026-02-31"});invalid({term:"INDEFINITE"});invalid({term:"LONG_FIXED"});invalid({endDate:"2027-11-01"});invalid({dueDay:4});invalid({tenancy:"SPOUSES"});invalid({confirmed:false as unknown as true});invalid({services:[{name:"[nedoplněná služba]",amountCents:1}]});invalid({landlord:{...leaseContractFixture.landlord,represented:true}});
invalid({landlord:{...leaseContractFixture.landlord,name:"W".repeat(201)}});
const zero=structuredClone(leaseContractFixture);zero.depositCents=0;zero.depositDueDate="";zero.depositAnnualRateBps=0;zero.services=[];zero.manager={name:"",email:"",phone:""};zero.directEnergy="Žádné";
const z=buildContract(zero),zt=z.sections.flatMap(s=>s.paragraphs).join("\n");assert(!zt.includes("5.2"));assert(zt.includes("Jistota se nesjednává"));assert(!zt.includes("informuje správce"));assert(!zt.includes("výtah"));assert(zt.includes("Energie přímo na nájemce se nesjednávají"));
if(process.env.CONTRACT_QA_OUTPUT){
  const dir=process.env.CONTRACT_QA_OUTPUT;await mkdir(dir,{recursive:true});
  const stress=structuredClone(samples[35]);stress.landlord.name="Brickflow – správa a pronájem bytových nemovitostí České republiky s.r.o.";stress.landlord.address="Velmi dlouhá doručovací adresa sídla společnosti v administrativním komplexu, budova C, 8. patro, Jabloňová 1234/567, 110 00 Praha";
  stress.tenancy="JOINT";stress.tenants=Array.from({length:8},(_,i)=>({...stress.tenants[0],name:`Nájemce ${i+1} ${"VelmiDlouhéPříjmení".repeat(4)}`,address:"Dlouhá adresa bydliště ".repeat(10)}));stress.occupantCount=8;stress.services=Array.from({length:30},(_,i)=>({name:`Skutečně zajišťovaná služba číslo ${i+1}`,amountCents:1000+i}));
  for(const [name,input]of [["short-fixed",samples[0]],["indefinite-spouses-company",samples[35]],["zero-deposit",zero],["stress",stress]] as const){await writeFile(`${dir}/${name}.pdf`,await contractPdf(input,false,"https://flatcloud.example.test/portal/najemnik/qa-tenant"));await writeFile(`${dir}/${name}.json`,JSON.stringify(buildContract(input),null,2));}
}
console.log(`PASS: ${checked} mutací, společný přehled a články, podpisy všech osob, inflační termíny, 13 odmítnutých chybných zadání a nulová jistota.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
