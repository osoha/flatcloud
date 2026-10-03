import qrcode from "qrcode-generator";

export function TenantPortalEntryQr({tenantId}:{tenantId:string}) {
  const base=process.env.RENDER_EXTERNAL_URL||process.env.APP_URL;
  if(!base)return <p>Odkaz portálu bude dostupný po nastavení adresy aplikace.</p>;
  const url=new URL(`/portal/najemnik/${encodeURIComponent(tenantId)}`,base).toString();
  const qr=qrcode(0,"M");qr.addData(url);qr.make();
  return <div className="verification-payment-qr"><img src={qr.createDataURL(5,8)} width={164} height={164} alt="QR kód pro přihlášení do Portálu nájemníka"/><p><a href={url}>Otevřít Portál nájemníka</a></p><small>QR pouze otevře přihlašovací stránku. Přístup získá nájemník až přijetím osobní pozvánky.</small></div>;
}
