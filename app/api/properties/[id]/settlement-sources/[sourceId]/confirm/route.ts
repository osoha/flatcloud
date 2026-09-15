import { requireUser } from '@/lib/auth';
import { boolValue } from '@/lib/forms';
import { confirmSettlementSource } from '@/lib/settlement-sources';
import { goWithMessage } from '@/lib/route-response';
export async function POST(request:Request,{params}:{params:Promise<{id:string;sourceId:string}>}){const actor=await requireUser(),{id,sourceId}=await params;try{const form=await request.formData();await confirmSettlementSource(actor,id,sourceId,boolValue(form,'confirm'),boolValue(form,'ownerWarning'));return goWithMessage(request,`/nemovitosti/${id}/vyuctovani/podklady/${sourceId}`,'ok','Údaje potvrzeny. Předpisy, kredity a platby se nezměnily.');}catch(e){return goWithMessage(request,`/nemovitosti/${id}/vyuctovani/podklady/${sourceId}`,'error',e instanceof Error?e.message:'Potvrzení se nepodařilo.');}}
