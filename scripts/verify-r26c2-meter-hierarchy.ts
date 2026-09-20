import assert from "node:assert/strict";
import { validateMeterHierarchy, type MeterHierarchyNode } from "../lib/meter-hierarchy";
let checks=0; function ok(name:string,run:()=>void){run();checks++;console.log(`✓ ${checks}. ${name}`);}
const main:MeterHierarchyNode={id:"main",propertyId:"p1",scope:"HOUSE_MAIN",type:"COLD_WATER",unitOfMeasure:"m³"};
const sub:MeterHierarchyNode={id:"sub",propertyId:"p1",scope:"HOUSE_SUBMETER",parentId:"main",type:"COLD_WATER",unitOfMeasure:"m³"};
ok("house hierarchy accepts same property and medium",()=>validateMeterHierarchy(sub,[main]));
ok("unit scope requires unit",()=>assert.throws(()=>validateMeterHierarchy({...sub,id:"u",scope:"UNIT",parentId:null},[main]),/jednotce/));
ok("hierarchy rejects another property",()=>assert.throws(()=>validateMeterHierarchy({...sub,propertyId:"p2"},[main]),/hranici nemovitosti/));
ok("hierarchy rejects different medium",()=>assert.throws(()=>validateMeterHierarchy({...sub,type:"HOT_WATER"},[main]),/stejné médium/));
ok("hierarchy rejects cycle",()=>assert.throws(()=>validateMeterHierarchy({...main,scope:"HOUSE_SUBMETER",parentId:"sub"},[sub]),/cyklus/));
const old:MeterHierarchyNode={id:"old",propertyId:"p1",unitId:"u1",scope:"UNIT",type:"COLD_WATER",unitOfMeasure:"m³",removedAt:new Date("2026-01-02")};
ok("replacement keeps same unit and medium",()=>validateMeterHierarchy({id:"new",propertyId:"p1",unitId:"u1",scope:"UNIT",type:"COLD_WATER",unitOfMeasure:"m³",replacementOfId:"old",installedAt:new Date("2026-01-02")},[old]));
ok("replacement rejects earlier installation",()=>assert.throws(()=>validateMeterHierarchy({id:"new",propertyId:"p1",unitId:"u1",scope:"UNIT",type:"COLD_WATER",unitOfMeasure:"m³",replacementOfId:"old",installedAt:new Date("2026-01-01")},[old]),/před vyřazením/));
console.log(`R26C2 meter hierarchy: ${checks} checks.`);
