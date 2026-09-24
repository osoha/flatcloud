import { Prisma } from "@prisma/client";
import { prisma } from "./db";
export async function collaboratorScope(user:{id:string;role:string}) : Promise<Prisma.UserWhereInput> {
 if(user.role==="SUPER_ADMIN")return {active:true};
 const shared=await prisma.userProperty.findMany({where:{userId:user.id},select:{propertyId:true}});
 return {active:true,OR:[
  {id:user.id},
  {memberships:{some:{propertyId:{in:shared.map(p=>p.propertyId)}}}},
  {unitMemberships:{some:{unit:{propertyId:{in:shared.map(p=>p.propertyId)}}}}}
 ]};
}
