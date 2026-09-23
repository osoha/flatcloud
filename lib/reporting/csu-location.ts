/** Explicit, verified district matches; unknown municipalities use the published national average. */
export function csuDistrictForCity(city:string){
  const key=city.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
  if(key==="plzen"||key==="cernice"||/^plzen [1-9][0-9]?(?:-|$)/.test(key))return "CZ0323";
  if(key==="teplice")return "CZ0426";
  if(key==="usti nad labem")return "CZ0427";
  return null;
}

export function selectCsuAverage<T extends {territoryCode:string;sourcePeriod:string}>(rows:T[],district:string|null,asOfYear:number):T|null{
  const codes=[district,district?.slice(0,5),"CZ"].flatMap(code=>code?[code]:[]);
  for(const code of codes){
    const latest=rows.filter(row=>row.territoryCode===code&&Number(row.sourcePeriod.slice(-4))<=asOfYear)
      .sort((a,b)=>Number(b.sourcePeriod.slice(-4))-Number(a.sourcePeriod.slice(-4))||Number(b.sourcePeriod.includes("-"))-Number(a.sourcePeriod.includes("-")))[0];
    if(latest)return latest;
  }
  return null;
}
