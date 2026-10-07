import {currentUser} from "@/lib/auth";
import {leaseContractPilotEnabled} from "@/lib/lease-contract/pilot";
import {bankAccountNoticePdf} from "@/lib/bank-account-notice-pdf";
import {previewNotice} from "@/lib/communication-preview";
export const dynamic="force-dynamic";
export async function GET() {
  const user=await currentUser();
  if(user?.role!=="SUPER_ADMIN"||!leaseContractPilotEnabled())return new Response("Not found",{status:404});
  const bytes=await bankAccountNoticePdf(previewNotice.title,previewNotice.body,previewNotice.reference);
  return new Response(new Uint8Array(bytes),{headers:{"Content-Type":"application/pdf","Content-Disposition":'inline; filename="test-oznameni-zmena-uctu.pdf"',"Cache-Control":"private, no-store"}});
}
