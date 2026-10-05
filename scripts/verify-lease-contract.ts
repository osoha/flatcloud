import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {PDFDocument} from "pdf-lib";
import {buildContract,contractFactErrors} from "../lib/lease-contract/model";
import {supplementFromForm} from "../lib/lease-contract/form";
import {leaseContractPilotEnabled,isLeaseContractTestRecord} from "../lib/lease-contract/pilot";
import {leaseContractPdf} from "../lib/lease-contract/pdf";
import {contractFacts as facts,contractSupplement as input} from "./lease-contract-fixture";

async function main(){
  const model=buildContract(facts,input),all=model.sections.flatMap(x=>x.paragraphs).join("\n"),cover=model.tables.flat(2).join("\n");
  assert.equal(model.sections.length,10); assert.equal(model.source.version,2);
  assert.ok(all.includes("2,75 % ročně") && cover.includes("2,75 % ročně"));
  assert.ok(all.includes("2\u00a0600,5 Kč") && cover.includes("2\u00a0600,5 Kč"));
  assert.ok(all.includes("17\u00a0600,5 Kč") && cover.includes("17\u00a0600,5 Kč"));
  assert.ok(all.includes("zákonné sazby podle § 2254")); assert.ok(all.includes("obnovení nájmu podle § 2285"));
  assert.ok(!all.includes("výtah") && !model.services.flat().join(" ").includes("Výtah"));
  assert.ok(!all.includes("doplní se její zápis"));
  assert.ok(!/[\[\]]/.test(all+cover+model.coverNote));
  assert.throws(()=>buildContract(facts,{...input,services:[{name:"Teplo",amountCents:1}]}),/Součet/);
  assert.throws(()=>buildContract(facts,{...input,services:[{name:"Teplo",amountCents:130025},{name:"Teplo",amountCents:130025}]}),/opakují/);
  assert.throws(()=>buildContract(facts,{...input,landlordName:"[jméno]"}));
  assert.throws(()=>buildContract(facts,{...input,confirmedTestRecord:false}));
  assert.throws(()=>buildContract(facts,{...input,signingDate:"2026-02-30"}));
  assert.throws(()=>buildContract(facts,{...input,firstPaymentDate:"2026-10-01"}));
  assert.throws(()=>buildContract(facts,{...input,landlordKind:"COMPANY"}));
  assert.throws(()=>buildContract({...facts,depositRateBps:null},input),/individuální/);
  assert.throws(()=>buildContract({...facts,endDate:null},input),/dobu určitou/);
  assert.throws(()=>buildContract({...facts,endDate:"2027-11-01"},input),/jednoho roku/);
  assert.throws(()=>buildContract({...facts,indexationEnabled:true},input),/indexace/);
  assert.throws(()=>buildContract({...facts,depositCents:4500001},input),/limit/);
  assert.throws(()=>buildContract({...facts,contractingParties:2},input),/jednoho/);
  assert.ok(contractFactErrors({...facts,dueDay:4}).length);
  const zero=buildContract({...facts,depositCents:0,servicesCents:0,depositRateBps:null},{...input,depositDueDate:null,services:[],managerName:"",managerEmail:"",managerPhone:""});
  assert.ok(zero.sections[4].paragraphs[0].includes("nevzniká povinnost"));
  assert.ok(!zero.sections[4].paragraphs.join(" ").includes("nájemce doplní"));
  assert.ok(zero.sections[0].paragraphs[1].includes("Provozní správce není sjednán"));
  assert.equal(zero.services.length,0);
  const form=new FormData();for(const [key,value] of Object.entries(input)) if(key!=="services") form.set(key,key==="confirmedTestRecord"?"on":String(value));
  input.services.forEach(x=>{form.append("serviceName",x.name);form.append("serviceAmount",String(x.amountCents/100));});
  assert.deepEqual(supplementFromForm(form),input);
  form.set("serviceAmount","1e4");assert.throws(()=>supplementFromForm(form));
  assert.ok(isLeaseContractTestRecord({contractNumber:"TEST-1",unit:{property:{name:"TEST Pilot"}}}));
  assert.ok(!isLeaseContractTestRecord({contractNumber:"1",unit:{property:{name:"TEST Pilot"}}}));
  const oldService=process.env.RENDER_SERVICE_ID;process.env.RENDER_SERVICE_ID="production-service";assert.equal(leaseContractPilotEnabled(),false);
  process.env.RENDER_SERVICE_ID="srv-dacselkmqu1s73bmjoq0";assert.equal(leaseContractPilotEnabled(),true);
  if(oldService===undefined)delete process.env.RENDER_SERVICE_ID;else process.env.RENDER_SERVICE_ID=oldService;
  const long=buildContract({...facts,tenantName:"TEST Ing. Jan Karel Alexandr Dvořák Novotný Šťastný z Nového Města a Podhradí",unitAddress:"Testovací alej generála Karla Alexandra Novotného 1234/56, 301 00 Plzeň Východní Předměstí"},{...input,landlordName:"TEST Investiční a nemovitostní společnost Rodinné bydlení západní Čechy s.r.o.",landlordKind:"COMPANY",landlordId:"00000000",landlordRegistration:"Krajský soud v Plzni, oddíl C, vložka 00000. Jedná TEST Jana Nováková, jednatelka.",landlordAddress:"Testovací nábřeží profesora Karla Alexandra Dvořáka Novotného 1234/56, 301 00 Plzeň Východní Předměstí",tenantAddress:"Testovací alej generála Karla Alexandra Novotného 1234/56, 301 00 Plzeň Východní Předměstí",representative:"TEST Ing. arch. Jana Kateřina Alexandra Nováková Dvořáková Šťastná, jednatelka"});
  const out=process.env.LEASE_CONTRACT_QA_OUTPUT;
  for(const [name,data] of [["standard",model],["zero",zero],["long",long]] as const){
    const bytes=await leaseContractPdf(data);assert.equal(bytes.subarray(0,5).toString(),"%PDF-");
    const pdf=await PDFDocument.load(bytes);assert.ok(pdf.getPageCount()>=5);assert.ok(pdf.getPageCount()<=8);
    if(out){await mkdir(out,{recursive:true});await writeFile(path.join(out,`${name}.pdf`),bytes);await writeFile(path.join(out,`${name}.json`),JSON.stringify(data,null,2));}
    console.log(`${name}: valid complete PDF, ${pdf.getPageCount()} pages`);
  }
  console.log("Lease contract model, form, variant guards and PDF checks PASS");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
