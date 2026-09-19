import { Prisma } from '@prisma/client';
import { editableUnitWhere } from './access';
import { documentAccessWhere } from './documents/access';
import { serializableTransaction } from './serializable';
import { readingDate, validateReadingPosition } from './meter-reading-rules';

type Actor = {id:string;role:string;allProperties?:boolean};
type Input = {propertyId:string;unitId?:string|null;meterId:string;readAt:string;value:number;method:string;leaseId?:string|null;note?:string|null;correctsId?:string|null;correctionReason?:string|null;evidenceDocumentId?:string|null};
export async function recordMeterReading(actor:Actor,input:Input) {
  const readAt=readingDate(input.readAt);
  if (!['PERSONAL','REMOTE','ESTIMATE'].includes(input.method)) throw new Error('Vyberte způsob odečtu: osobní, dálkový nebo odhad.');
  if (input.method === 'ESTIMATE' && !input.note?.trim()) throw new Error('U odhadu uveďte důvod a způsob stanovení.');
  if (input.correctsId && !input.correctionReason?.trim()) throw new Error('Uveďte důvod opravy.');
  try {
    return await serializableTransaction(async tx => {
      const meter=await tx.meter.findFirst({where:input.unitId
        ? {id:input.meterId,propertyId:input.propertyId,unitId:input.unitId,unit:editableUnitWhere(actor,input.propertyId)}
        : {id:input.meterId,propertyId:input.propertyId,unitId:null,scope:{in:['HOUSE_MAIN','HOUSE_SUBMETER']}},include:{readings:true}});
      if(!meter) throw new Error('Měřidlo není dostupné k úpravě nebo je nemovitost archivovaná.');
      const original=input.correctsId ? meter.readings.find(r=>r.id===input.correctsId) : null;
      validateReadingPosition(meter.readings,readAt,input.value,input.correctsId);
      const leaseId=input.unitId ? (original ? original.leaseId : input.leaseId || null) : null;
      if(leaseId && !await tx.lease.findFirst({where:{id:leaseId,unitId:input.unitId!},select:{id:true}})) throw new Error('Nájemní vztah nepatří k jednotce.');
      // A correction cannot silently lose an existing attachment.
      const evidenceId=input.evidenceDocumentId || original?.evidenceDocumentId || null;
      const evidence=evidenceId ? await tx.document.findFirst({where:{AND:[documentAccessWhere(actor),input.unitId
        ? {id:evidenceId,propertyId:input.propertyId,OR:[{unitId:input.unitId},{lease:{unitId:input.unitId}}]}
        : {id:evidenceId,propertyId:input.propertyId,unitId:null,leaseId:null}]},include:{fileAsset:true}}) : null;
      if(evidenceId && (!evidence || !(evidence.fileAsset.mimeType.startsWith('image/') || evidence.fileAsset.mimeType==='application/pdf'))) throw new Error(input.unitId?'Důkaz musí být dostupná fotografie nebo PDF této jednotky.':'Důkaz musí být dostupná fotografie nebo PDF tohoto objektu.');
      const reading=await tx.meterReading.create({data:{meterId:meter.id,readAt:original?.readAt || readAt,value:input.value,leaseId,method:input.method,unitOfMeasure:original?.unitOfMeasure || meter.unitOfMeasure,createdById:actor.id,note:input.note?.trim()||null,correctsId:input.correctsId||null,correctionReason:input.correctsId ? input.correctionReason!.trim() : null,evidenceDocumentId:evidenceId,evidenceSnapshot:evidence ? {documentId:evidence.id,title:evidence.title,fileAssetId:evidence.fileAssetId,sha256:evidence.fileAsset.sha256,mimeType:evidence.fileAsset.mimeType} : Prisma.DbNull}});
      await tx.auditLog.create({data:{userId:actor.id,propertyId:input.propertyId,action:input.correctsId?'METER_READING_CORRECTED':'METER_READING_CREATED',entityType:'MeterReading',entityId:reading.id,details:{meterId:meter.id,unitId:input.unitId,correctsId:input.correctsId||null,method:input.method,evidenceDocumentId:evidenceId}}});
      return reading;
    });
  } catch(error) {
    if(error instanceof Prisma.PrismaClientKnownRequestError && error.code==='P2002') throw new Error('Odečet byl mezitím opraven. Obnovte historii.');
    throw error;
  }
}
