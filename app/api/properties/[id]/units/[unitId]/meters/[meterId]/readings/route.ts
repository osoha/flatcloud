import { floatValue, text } from '@/lib/forms';
import { requireManagedProperty } from '@/lib/management';
import { recordMeterReading } from '@/lib/meter-readings';
import { go, goWithMessage } from '@/lib/route-response';

export async function POST(request:Request,{params}:{params:Promise<{id:string;unitId:string;meterId:string}>}) {
  const {id,unitId,meterId}=await params;
  const access=await requireManagedProperty(id);
  if(!access) return go(request,'/login');
  try {
    const form=await request.formData();
    const value=floatValue(form,'value');
    if(value===null) throw new Error('Zadejte stav měřidla.');
    await recordMeterReading(access.user,{propertyId:id,unitId,meterId,value,readAt:text(form,'readAt',true)!,method:text(form,'method',true)!,leaseId:text(form,'leaseId'),note:text(form,'note'),correctsId:text(form,'correctsId'),correctionReason:text(form,'correctionReason'),evidenceDocumentId:text(form,'evidenceDocumentId')});
    return goWithMessage(request,`/nemovitosti/${id}/jednotky/${unitId}#meridla`,'ok','Odečet byl uložen. Původní historie zůstává zachována.');
  } catch(error) {
    return goWithMessage(request,`/nemovitosti/${id}/jednotky/${unitId}#meridla`,'error',error instanceof Error?error.message:'Odečet se nepodařilo uložit.');
  }
}
