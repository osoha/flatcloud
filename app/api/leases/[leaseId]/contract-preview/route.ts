import {currentUser} from "@/lib/auth";
import {contractPilotData} from "@/lib/lease-contract/data";
import {buildContract} from "@/lib/lease-contract/model";
import {supplementFromForm} from "@/lib/lease-contract/form";
import {leaseContractPdf} from "@/lib/lease-contract/pdf";
import {ZodError} from "zod";
import {redirectUrl} from "@/lib/redirect-url";

export const dynamic="force-dynamic";
export async function POST(request:Request,{params}:{params:Promise<{leaseId:string}>}) {
  const actor=await currentUser(); if(!actor) return new Response("Not found",{status:404});
  if(request.headers.get("origin") !== redirectUrl("/",request).origin) return new Response("Forbidden",{status:403});
  if(!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return new Response("Unsupported media type",{status:415});
  if(Number(request.headers.get("content-length")||0)>32_768) return new Response("Údaje jsou příliš dlouhé.",{status:413});
  const {leaseId}=await params,data=await contractPilotData(actor,leaseId);
  if(!data) return new Response("Not found",{status:404});
  if(data.errors.length) return new Response(data.errors.join("\n"),{status:422,headers:{"Cache-Control":"private, no-store"}});
  try {
    const raw=await request.text();
    if(Buffer.byteLength(raw)>32_768) return new Response("Údaje jsou příliš dlouhé.",{status:413});
    const form=new FormData();new URLSearchParams(raw).forEach((value,key)=>form.append(key,value));
    const input=supplementFromForm(form);
    const bytes=await leaseContractPdf(buildContract(data.facts,input));
    return new Response(Buffer.from(bytes),{headers:{"Content-Type":"application/pdf","Content-Disposition":`inline; filename="flatcloud-najemni-smlouva-nahled.pdf"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  }catch(error){
    const message=error instanceof ZodError ? error.issues.map(x=>`${x.path.join(".")}: ${x.message}`).join("\n") : error instanceof Error ? error.message : "Náhled se nepodařilo vytvořit.";
    return new Response(message,{status:422,headers:{"Cache-Control":"private, no-store","Content-Type":"text/plain; charset=utf-8"}});
  }
}
