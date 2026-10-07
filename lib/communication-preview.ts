import qrcode from "qrcode-generator";
import {notificationEmailContent, rentEmailContent, renderCommunicationFrame} from "./communication-design";

/** Synthetic examples only; this module never reads recipients, queues or transport. */
export const previewNotice = {
  title: "Oznámení o změně platebních údajů",
  reference: "TEST-OZN-2026-001",
  body: "Smlouva: TEST-N-2026-001\n\nJednotka: Ukázková 24, Brno – byt 12\n\nNájemce: Tereza Novotná\n\nOd 1. 11. 2026 používejte pro další úhrady nájemného, záloh i dosavadních nedoplatků níže uvedený účet.\n\nDosavadní účet: 19-2000145399/0800\n\nNový účet: 2100000000/2010\n\nVariabilní symbol: 2026012\n\nVýše nájemného, záloh a sjednané splatnosti se tímto oznámením nemění.\n\nUpravte prosím trvalý příkaz a potvrďte přečtení oznámení v portálu.\n\nPodklad změny: Ukázkové oznámení podle nájemní smlouvy.\n\nVystavil: Modelové bydlení s.r.o., Jan Novák\n\nVystaveno: 7. 10. 2026\n\nTESTOVACÍ NÁHLED – nejde o platební pokyn ani skutečné oznámení.",
};
export function communicationPreviews() {
  const owner = {name:"Modelové bydlení s.r.o.",ico:null,address:"Ukázková 24, 602 00 Brno",email:"sprava@example.test",phone:null};
  const payment = {amount:"12 500,00 Kč",iban:"CZ6508000000192000145399",variableSymbol:"2026012",dueDate:"15. 10. 2026",overdue:false};
  const qr = qrcode(0,"M");qr.addData("FlatBerry: pouze testovaci nahled, ne platebni prikaz");qr.make();
  const rows = [
    {id:"payment",label:"Platební údaje",pdf:false,html:rentEmailContent({owner,title:"Nájem za říjen 2026",body:"Dobrý den, paní Novotná,\n\nposíláme platební údaje k vašemu nájmu v bytě 12, Ukázková 24.\n\nDěkujeme za včasnou úhradu.",payment,qrSource:qr.createDataURL(5,10)})},
    {id:"reminder",label:"Připomenutí platby",pdf:false,html:rentEmailContent({owner,title:"Připomenutí úhrady nájmu",body:"Dobrý den, paní Novotná,\n\nu nájmu za říjen evidujeme dosud neuhrazenou částku. Pokud jste platbu právě odeslala, děkujeme; připsání může chvíli trvat.",payment:{...payment,overdue:true},qrSource:qr.createDataURL(5,10)})},
    {id:"bank-change",label:"Změna účtu",pdf:true,html:notificationEmailContent({category:"Oficiální oznámení",title:previewNotice.title,message:"K vašemu nájmu bylo vydáno oficiální oznámení. Úplné znění najdete v přiloženém PDF. Prosíme o přečtení a potvrzení v portálu.",action:{label:"Otevřít v portálu nájemníka",url:"https://example.test/portal/najemnik"},attachmentLabel:previewNotice.title+" (PDF)",footer:"Odpovězte přímo v portálu. Toto je pouze testovací náhled."})},
    {id:"task",label:"Zpráva k úkolu",pdf:false,html:notificationEmailContent({category:"Nová zpráva",title:"Termín opravy dveří",message:"Správce: Dobrý den, technik může přijít ve čtvrtek mezi 9. a 11. hodinou. Vyhovuje vám tento termín?",action:{label:"Otevřít v portálu nájemníka",url:"https://example.test/portal/najemnik"},footer:"Odpovězte přímo v portálu. Toto je pouze testovací náhled."})},
  ];
  return rows.map(row=>({...row,html:`<!doctype html><html lang="cs"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${row.label} – testovací náhled</title></head><body style="margin:0">${renderCommunicationFrame(row.html)}</body></html>`}));
}
