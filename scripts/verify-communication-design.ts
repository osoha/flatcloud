import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {PDFDocument,PDFPage} from "pdf-lib";
import {bankAccountNoticePdf} from "../lib/bank-account-notice-pdf";
import {communicationPreviews,previewNotice} from "../lib/communication-preview";
import {notificationEmailContent} from "../lib/communication-design";
import {prepareFlatBerryMail} from "../lib/email";

async function main() {
  const output=process.env.COMMUNICATION_DESIGN_OUTPUT;
  if(output)await mkdir(output,{recursive:true});
  const original=PDFPage.prototype.drawText;
  let drawn:string[]=[];
  PDFPage.prototype.drawText=function(value,options={}) {
    const size=options.size||10;
    assert.ok((options.x||0)>=0 && (options.y||0)>=0 && (options.y||0)+size<=this.getHeight(),`Outside page: ${value}`);
    if(options.font)assert.ok((options.x||0)+options.font.widthOfTextAtSize(value,size)<=this.getWidth()+.1,`Overflow: ${value}`);
    drawn.push(value);
    return original.call(this,value,options);
  };
  try {
    for(const [kind,body] of [["notice",previewNotice.body],["long-notice",(previewNotice.body+"\n\n").repeat(12)+"A".repeat(700)]] as const) {
      drawn=[];
      const bytes=await bankAccountNoticePdf(previewNotice.title,body,previewNotice.reference);
      const pdf=await PDFDocument.load(bytes);
      assert.ok(kind==="notice"?pdf.getPageCount()===1:pdf.getPageCount()>2);
      // Headers/footers may interrupt flow, but no original body character may be lost.
      const retained=drawn.join("").replace(/\s/g,"");let cursor=0;
      for(const char of body.replace(/\s/g,"")){cursor=retained.indexOf(char,cursor);assert.ok(cursor>=0,`Lost ${char}`);cursor++;}
      if(output)await writeFile(path.join(output,`${kind}.pdf`),bytes);
      console.log(`${kind}: ${pdf.getPageCount()} page(s), complete text within page bounds`);
    }
  }finally{PDFPage.prototype.drawText=original;}
  for(const row of communicationPreviews()) {
    const mail=await prepareFlatBerryMail({to:"preview@example.test",subject:row.label,text:row.label,html:row.html});
    assert.equal(mail.html.match(/data-flatberry-email="1"/g)?.length,1);
    assert.ok(mail.html.includes("cid:flatberry-brand-logo@flatberry"));
    assert.ok(!mail.attachments?.some(a=>a.contentType==="application/pdf"),"A frame must never implicitly generate PDFs");
    if(output)await writeFile(path.join(output,`${row.id}.html`),row.html);
  }
  const escaped=notificationEmailContent({category:"<script>",title:'"<unsafe>"',message:"&<script>",action:{label:"<Otevřít>",url:"https://example.test/a?x=1&y=2"}});
  assert.ok(!escaped.includes("<script>"));assert.ok(escaped.includes("&amp;"));
  assert.throws(()=>notificationEmailContent({category:"Test",title:"Test",message:"Test",action:{label:"Click",url:"javascript:alert(1)"}}));
  console.log("Shared communication layout, escaping and explicit attachment policy verified.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
