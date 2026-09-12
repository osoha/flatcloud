export type UnitBatchRow={label:string;floor:string|null;areaM2:number|null};

export function parseUnitBatch(raw:string,max=50):UnitBatchRow[]{
  const lines=raw.split(/\r?\n/).map((line)=>line.trim()).filter(Boolean);
  if(!lines.length)throw new Error("Zadejte alespoň jednu jednotku.");
  if(lines.length>max)throw new Error(`V jedné dávce lze založit nejvýše ${max} jednotek.`);
  const rows=lines.map((line,index)=>{const [labelRaw,floorRaw="",areaRaw="",...extra]=line.split(";").map((part)=>part.trim());if(extra.length)throw new Error(`Řádek ${index+1} má příliš mnoho sloupců.`);if(!labelRaw)throw new Error(`Na řádku ${index+1} chybí označení jednotky.`);let areaM2:number|null=null;if(areaRaw){areaM2=Number(areaRaw.replace(",","."));if(!Number.isFinite(areaM2)||areaM2<=0)throw new Error(`Na řádku ${index+1} není platná kladná plocha.`);}return {label:labelRaw,floor:floorRaw||null,areaM2};});
  const labels=new Set<string>();for(const row of rows){const key=row.label.toLocaleLowerCase("cs");if(labels.has(key))throw new Error(`Označení „${row.label}“ je v dávce vícekrát.`);labels.add(key);}return rows;
}
