import { prisma } from "./db";
export async function userPropertyOverview() {
 const [properties,events]=await Promise.all([
  prisma.property.findMany({where:{active:true},select:{id:true,name:true,managerId:true,owner:{select:{userId:true}},memberships:{select:{userId:true}},units:{where:{operationalStatus:{not:"INACTIVE"}},select:{id:true,userAccesses:{select:{userId:true}}}}},orderBy:{name:"asc"}}),
  prisma.auditLog.findMany({where:{action:"PROPERTY_CREATED",entityType:"Property"},select:{entityId:true,userId:true},orderBy:{createdAt:"asc"}})
 ]);
 const creators=new Map<string,string|null>();for(const event of events)if(event.entityId&&!creators.has(event.entityId))creators.set(event.entityId,event.userId);
 return (userId:string)=>properties.flatMap(p=>{
  const created=creators.get(p.id)===userId,managed=p.managerId===userId,owned=p.owner.userId===userId,wholeAccess=p.memberships.some(m=>m.userId===userId);
  const unitAccess=p.units.filter(u=>u.userAccesses.some(m=>m.userId===userId));
  const roles=[created?"Založil":null,managed?"Spravuje":null,owned?"Vlastník":null,wholeAccess?"Přístup k domu":unitAccess.length?"Přístup k jednotkám":null].filter(Boolean) as string[];
  return roles.length?[{id:p.id,name:p.name,roles,units:p.units.length,accessibleUnits:wholeAccess?p.units.length:unitAccess.length}]:[];
 });
}
