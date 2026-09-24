import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { go, goWithMessage } from "@/lib/route-response";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 const user=await currentUser();if(!user)return go(request,"/login");
 if(user.role!=="SUPER_ADMIN"||request.headers.get("sec-fetch-site")==="cross-site")return goWithMessage(request,"/portfolio","error","Oznámení může spravovat pouze super-admin.");
 const {id}=await params;
 try{
 const form=await request.formData(),action=String(form.get("action")||"");
 if(!["activate","deactivate","edit"].includes(action))throw new Error("Neplatná akce.");
 await prisma.$transaction(async tx=>{
  const before=await tx.announcement.findUnique({where:{id}});if(!before)throw new Error("Oznámení nebylo nalezeno.");
  if(form.get("revision")!==before.updatedAt.toISOString())throw new Error("Oznámení se změnilo. Obnovte stránku.");
  const title=String(form.get("title")||"").trim(),body=String(form.get("body")||"").trim();
  if(action==="edit"&&(!title||title.length>200||!body||body.length>20000))throw new Error("Vyplňte název do 200 a text do 20 000 znaků.");
  const reset=action==="edit"&&form.get("notifyAgain")==="on";
  const data=action==="edit"?{title,body}:{active:action==="activate"};
  const changed=await tx.announcement.updateMany({where:{id,updatedAt:before.updatedAt},data});if(changed.count!==1)throw new Error("Oznámení se mezitím změnilo.");
  if(reset)await tx.announcementUserState.updateMany({where:{announcementId:id},data:{readAt:null,dismissedAt:null}});
  await tx.auditLog.create({data:{userId:user.id,action:action==="edit"?"ANNOUNCEMENT_EDITED":action==="activate"?"ANNOUNCEMENT_ACTIVATED":"ANNOUNCEMENT_DEACTIVATED",entityType:"Announcement",entityId:id,details:{before:{title:before.title,body:before.body,active:before.active},after:data,notifyAgain:reset}}});
 });return goWithMessage(request,`/nastaveni/oznameni#${id}`,"ok","Oznámení bylo upraveno.");
 }catch(e){return goWithMessage(request,"/nastaveni/oznameni","error",e instanceof Error?e.message:"Úprava se nezdařila.");}
}
