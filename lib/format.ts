export const money=(cents:number)=>new Intl.NumberFormat("cs-CZ",{style:"currency",currency:"CZK",maximumFractionDigits:0}).format(cents/100);
export const date=(d:Date|string)=>new Intl.DateTimeFormat("cs-CZ").format(new Date(d));
