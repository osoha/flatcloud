export type UnitBatchRow={label:string;floor:string|null;areaM2:number|null};

export function parseUnitBatch(raw:string,max=50):UnitBatchRow[]{
  const lines=raw.split(/\r?\n/).map((line)=>line.trim()).filter(Boolean);
  if(!lines.length)throw new Error("Zadejte alespoÅˆ jednu jednotku.");
  if(lines.length>max)throw new Error(`V jednÃ© dÃ¡vce lze zaloÅ¾it nejvÃ½Å¡e ${max} jednotek.`);
  const rows=lines.map((line,index)=>{const [labelRaw,floorRaw="",areaRaw="",...extra]=line.split(";").map((part)=>part.trim());if(extra.length)throw new Error(`Å˜Ã¡dek ${index+1} mÃ¡ pÅ™Ã­liÅ¡ mnoho sloupcÅ¯.`);if(!labelRaw)throw new Error(`Na Å™Ã¡dku ${index+1} chybÃ­ oznaÄenÃ­ jednotky.`);let areaM2:number|null=null;if(areaRaw){areaM2=Number(areaRaw.replace(",","."));if(!Number.isFinite(areaM2)||areaM2<=0)throw new Error(`Na Å™Ã¡dku ${index+1} nenÃ­ platnÃ¡ kladnÃ¡ plocha.`);}return {label:labelRaw,floor:floorRaw||null,areaM2};});
  const labels=new Set<string>();for(const row of rows){const key=row.label.toLocaleLowerCase("cs");if(labels.has(key))throw new Error(`OznaÄenÃ­ â€${row.label}â€œ je v dÃ¡vce vÃ­cekrÃ¡t.`);labels.add(key);}return rows;
}
×M:ã;yÇtã®8ßÇß¾ùkm÷o·Û×nİí­Z×ÍúïM%‰¿î+[j×!¶