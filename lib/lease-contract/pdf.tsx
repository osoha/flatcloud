import React from "react";
import path from "node:path";
import {PDFDocument} from "pdf-lib";
import type {LeaseContractModel} from "./model";

export async function leaseContractPdf(model:LeaseContractModel) {
const {Document, Font, Page, Text:PdfText, View, StyleSheet, renderToBuffer}=await import("@react-pdf/renderer");
function Text(props:React.ComponentProps<typeof PdfText>){return <PdfText {...props} hyphenationCallback={word=>[word]}/>;}
const family = "LeaseContractGeist";
const geistFont = path.join(process.cwd(),"node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf");
const registerFonts=()=>Font.register({family,fonts:[{src:geistFont},{src:geistFont,fontWeight:700}]});
registerFonts();
const styles = StyleSheet.create({
  page:{fontFamily:family,fontSize:9.4,lineHeight:1.4,paddingTop:40,paddingBottom:44,paddingHorizontal:42,color:"#172033"},
  header:{position:"absolute",top:18,left:42,right:42,fontSize:7,color:"#64748b"},
  footer:{position:"absolute",bottom:20,left:42,right:42,fontSize:7,color:"#64748b"},
  title:{fontSize:21,fontWeight:700,marginBottom:8},intro:{fontSize:8.5,marginBottom:8},
  heading:{fontSize:11.5,fontWeight:700,marginTop:7,marginBottom:5},paragraph:{marginBottom:8},
  table:{marginBottom:3,borderLeftWidth:0.6,borderRightWidth:0.6,borderTopWidth:0.6,borderColor:"#d9d9d9"},
  row:{flexDirection:"row",borderBottomWidth:0.6,borderColor:"#d9d9d9",fontSize:8.1,lineHeight:1.35},
  label:{width:"26%",padding:4,borderRightWidth:0.6,borderColor:"#d9d9d9"},value:{width:"74%",padding:4},
  serviceName:{width:"75%",padding:4},serviceAmount:{width:"25%",padding:4,textAlign:"right"},
  tableHeader:{backgroundColor:"#e8edf4",fontWeight:700},note:{fontSize:8,marginTop:7},
  signatures:{marginTop:16},signatureRow:{flexDirection:"row",gap:20},signature:{width:"48%",minHeight:110,flexDirection:"column",justifyContent:"space-between"},
  signatureTitle:{fontWeight:700,marginBottom:9},signatureLine:{marginTop:24,borderTopWidth:0.6,borderColor:"#64748b",paddingTop:4},
});
function Frame(){return <><Text style={styles.header} fixed>FLATCLOUD / Nájemní smlouva k bytu</Text><Text style={styles.footer} fixed>Náhled</Text></>}
function Cover({model}:{model:LeaseContractModel}) {
  return <Page size="A4" style={styles.page}><Frame/><Text style={styles.title}>{model.title}</Text><Text style={styles.intro}>{model.intro}</Text>
    {model.tables.map((table,index)=><View key={index}><Text style={styles.heading} minPresenceAhead={80}>{["Smluvní strany a správce","Byt a doba nájmu","Měsíční platby a jistota"][index]}</Text><View style={styles.table}>
      {table.map((row,i)=><View key={i} wrap={false} style={[styles.row,i===0 ? styles.tableHeader : {}]}><Text style={styles.label}>{row[0]}</Text><Text style={styles.value}>{row[1]}</Text></View>)}
    </View></View>)}
    <View style={styles.table}><View style={[styles.row,styles.tableHeader]} wrap={false}><Text style={styles.serviceName}>Zálohy na služby měsíčně</Text><Text style={styles.serviceAmount}>Kč</Text></View>
      {(model.services.length ? model.services : [["Služby hrazené zálohami nejsou sjednány","0 Kč"]]).map((row,i)=><View key={i} style={styles.row} wrap={false}><Text style={styles.serviceName}>{row[0]}</Text><Text style={styles.serviceAmount}>{row[1]}</Text></View>)}
    </View><Text style={styles.note}>{model.coverNote}</Text>
  </Page>;
}
  // Never silently let the essential summary overflow onto another page.
  const coverBytes=await renderToBuffer(<Document><Cover model={model}/></Document>);
  if((await PDFDocument.load(coverBytes)).getPageCount() !== 1) throw new Error("Úvodní přehled je příliš dlouhý. Zkraťte doplňované údaje nebo rozpis služeb.");
  registerFonts();
  const groups=[model.sections.slice(0,3),model.sections.slice(3,5),model.sections.slice(5,7),model.sections.slice(7)];
  const bytes=await renderToBuffer(<Document title={model.title} author="Flat Cloud a.s." subject="Náhled nájemní smlouvy" keywords={`template-v1;${model.source.sha256}`}>
    <Cover model={model}/>{groups.map((group,i)=><Page key={i} size="A4" style={styles.page}><Frame/>
      {group.map(section=><View key={section.title}><Text style={styles.heading} minPresenceAhead={55}>{section.title}</Text>{section.paragraphs.map(p=><Text key={p.slice(0,8)} style={styles.paragraph} orphans={3} widows={3}>{p}</Text>)}</View>)}
      {i===3&&<View wrap={false} style={styles.signatures}><Text style={styles.paragraph}>{model.signingLine}</Text><View style={styles.signatureRow}>
        <View style={styles.signature}><View><Text style={styles.signatureTitle}>Pronajímatel</Text><Text>{model.landlord}</Text><Text>Podepisuje: {model.representative}</Text></View><Text style={styles.signatureLine}>Podpis</Text></View>
        <View style={styles.signature}><View><Text style={styles.signatureTitle}>Nájemce</Text><Text>{model.tenant}</Text></View><Text style={styles.signatureLine}>Podpis</Text></View>
      </View></View>}
    </Page>)}
  </Document>);
  const pdf=await PDFDocument.load(bytes);
  pdf.getPages().forEach((page,i)=>page.drawText(`Strana ${i+1} z ${pdf.getPageCount()}`,{x:470,y:21,size:7}));
  return Buffer.from(await pdf.save());
}
