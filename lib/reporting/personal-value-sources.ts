/** Navigation only. This module never downloads or reads values from third-party sites. */
export function personalValueSources(property:{city:string;name:string;cadastralArea?:string|null}){
  const locality=`${property.name} ${property.cadastralArea||""}`.toLocaleLowerCase("cs");
  const city=property.city.toLocaleLowerCase("cs");
  const sreality=locality.includes("černice")
    ?"https://www.sreality.cz/cenova-mapa/hledani/byty/plzensky-kraj-2/plzen-mesto-12/plzen-1243/cernice-14977"
    :city.includes("teplice")
      ?"https://www.sreality.cz/cenova-mapa/hledani/byty/ustecky-kraj-4/teplice-26/teplice-2074"
      :city.includes("ústí nad labem")
        ?"https://www.sreality.cz/cenova-mapa/hledani/byty/ustecky-kraj-4/usti-nad-labem-27/usti-nad-labem-1244"
        :"https://www.sreality.cz/cenova-mapa";
  return [
    {label:"Sreality · cenová mapa",href:sreality,detail:"Zkontrolujte, zda zobrazené území odpovídá domu; u Teplic a Ústí je předvolena obec."},
    {label:"Reas · cenová mapa",href:"https://www.reas.cz/cenova-mapa",detail:"Vyhledejte adresu a ověřte typ údaje a počet srovnatelných prodejů."},
    {label:"ČSÚ · ceny nemovitostí",href:"https://csu.gov.cz/ceny-nemovitosti",detail:"Širší územní statistika a index; není cenou konkrétní ulice."},
  ];
}
