type Result = { formattedAddress?:string; location?:{latitude?:number;longitude?:number}; granularity?:string; addressComponents?:{types?:string[];shortText?:string;longText?:string}[] };
const houseNumber=(value:string)=>value.match(/\b\d+[a-z]?(?:\s*\/\s*\d+[a-z]?)?\b/i)?.[0].replace(/\s/g,"").toLowerCase()||"";
export function geocodeCandidates(raw:unknown,address:string) {
  if(!Array.isArray(raw))return [];
  return (raw as Result[]).slice(0,20).flatMap(r=>{
    const country=r.addressComponents?.find(c=>c.types?.includes("country"))?.shortText;
    const lat=r.location?.latitude,lng=r.location?.longitude;
    if(country&&country!=="CZ"||typeof lat!=="number"||typeof lng!=="number"||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)return [];
    const label=r.formattedAddress||"Neúplná adresa",wanted=houseNumber(address),found=houseNumber(label);
    const rank=!found?2:wanted&&wanted!==found?1:0;
    const note=(!found?"Pouze ulice / oblast; konkrétní dům nebyl určen":rank?"Číslo domu se liší; shoda nepotvrzena":"Ověřte ulici, obec a správný dům")+(r.granularity!=="ROOFTOP"?" · přibližná poloha":"");
    return [{label,location:{lat,lng},note,rank}];
  }).sort((a,b)=>a.rank-b.rank);
}
