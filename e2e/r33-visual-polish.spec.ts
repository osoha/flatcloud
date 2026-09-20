import { expect, test, type Page } from "@playwright/test";

const email=process.env.E2E_ADMIN_EMAIL||"e2e.admin@flatcloud.test",password=process.env.E2E_ADMIN_PASSWORD||"FlatCloud-E2E-Only-Password-2026";
async function login(page:Page,address=email){await page.goto("/login");await page.getByLabel("E-mail",{exact:true}).fill(address);await page.getByLabel("Heslo",{exact:true}).fill(password);await page.getByRole("button",{name:"Přihlásit se",exact:true}).click();await expect(page).toHaveURL(/\/portfolio/);}
async function headers(page:Page){return{Cookie:(await page.context().cookies()).map(c=>`${c.name}=${c.value}`).join("; ")};}
test("R33: dark mode persists, wide layout and important portfolio content precede objects",async({page})=>{
 await page.setViewportSize({width:2560,height:1200});await login(page);
 const attention=page.getByRole("heading",{name:"Vyžaduje pozornost",exact:true}),objects=page.getByRole("heading",{name:"Nemovitosti",exact:true});
 expect((await attention.boundingBox())!.y).toBeLessThan((await objects.boundingBox())!.y);
 const theme=page.locator(".sidebar").getByRole("button",{name:"Tmavý režim",exact:true});await theme.click();await expect(page.locator("html")).toHaveAttribute("data-theme","dark");await page.reload();await expect(page.locator("html")).toHaveAttribute("data-theme","dark");
 for(const route of ["/portfolio","/reporty","/distribuce","/revize","/nastaveni"]){await page.goto(route);await expect(page.locator("h1")).toBeVisible();await expect(page.locator("html")).toHaveAttribute("data-theme","dark");expect(await page.locator(".page").evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(2000);if(route==="/reporty")await expect(page.locator(".report-tabs a.active")).toHaveCSS("background-color","rgb(36, 104, 239)");await page.screenshot({path:test.info().outputPath(`dark-${route.slice(1)}.png`),fullPage:false});}
 await page.locator(".sidebar").getByRole("button",{name:"Široký obsah",exact:true}).click();expect(await page.locator(".page").evaluate(el=>el.getBoundingClientRect().width)).toBeLessThanOrEqual(1440);
 await page.setViewportSize({width:390,height:844});await expect(page.locator(".top-actions").getByRole("button",{name:"Tmavý režim",exact:true})).toBeVisible();await page.locator(".top-actions").getByRole("button",{name:"Tmavý režim",exact:true}).click();await expect(page.locator("html")).toHaveAttribute("data-theme","light");
});
test("R33: merged tenancy, actionable settings and contact directory",async({page})=>{
 await login(page);await page.goto("/reporty?view=contracts");await expect(page.getByRole("heading",{name:"Nájemní vztahy",exact:true})).toBeVisible();await expect(page.locator(".report-tabs").getByRole("link",{name:"Smlouvy",exact:true})).toHaveCount(0);await expect(page.getByRole("button",{name:"Stáhnout CSV"})).toBeVisible();await expect(page.locator(".report-tabs").getByRole("link",{name:"KPIs",exact:true})).toBeVisible();
 await page.goto("/nastaveni");const link=page.locator(".admin-health-card").filter({hasText:"Bankovní schránka"}).getByRole("link");await link.click();await expect(page).toHaveURL(/#bankovni-schranka$/);await expect(page.locator("#bankovni-schranka")).toBeVisible();
 await page.goto("/distribuce/zajemci");await expect(page.getByRole("heading",{name:"Adresář zájemců"})).toBeVisible();
});
test("R33: unit editor without house grant owns meters and private avatar; cross-unit writes rejected",async({page})=>{
 test.skip(Boolean(process.env.E2E_BASE_URL),"Isolated fixtures only");const {prisma:db}=await import("../lib/db");const admin=await db.user.findUniqueOrThrow({where:{email}}),stamp=Date.now();
 const user=await db.user.create({data:{name:"R33 unit editor",email:`r33-unit-${stamp}@example.test`,passwordHash:admin.passwordHash,role:"OWNER_VIEWER"}}),owner=await db.owner.create({data:{name:"R33 owner"}}),property=await db.property.create({data:{ownerId:owner.id,name:"R33 isolated",address:"Testovací 33",city:"Praha"}});
 const own=await db.unit.create({data:{propertyId:property.id,label:"R33 own",userAccesses:{create:{userId:user.id,permission:"EDIT"}}}}),other=await db.unit.create({data:{propertyId:property.id,label:"R33 other"}});
 try{await login(page,user.email);const h=await headers(page),base=`/api/properties/${property.id}/units/${own.id}/meters`;
 await page.request.post(base,{headers:h,form:{type:"COLD_WATER",label:"R33 standalone"}});const meter=await db.meter.findFirstOrThrow({where:{unitId:own.id}});expect(meter.parentId).toBeNull();
 await page.request.post(`${base}/${meter.id}/readings`,{headers:h,form:{readAt:"2026-01-01",value:"100",method:"PERSONAL"}});await page.request.post(`${base}/${meter.id}/readings`,{headers:h,form:{readAt:"2026-02-01",value:"110",method:"PERSONAL"}});expect(await db.meterReading.count({where:{meterId:meter.id}})).toBe(2);
 await page.request.post(`${base}/${meter.id}/tariffs`,{headers:h,form:{validFrom:"2026-01-01",price:"100",advance:"800"}});expect(await db.meterTariff.count({where:{meterId:meter.id}})).toBe(1);
 await page.request.post(`/api/properties/${property.id}/units/${other.id}/meters`,{headers:h,form:{type:"GAS",label:"FORBIDDEN"}});expect(await db.meter.count({where:{unitId:other.id}})).toBe(0);
 await db.userUnit.update({where:{userId_unitId:{userId:user.id,unitId:own.id}},data:{permission:"VIEW"}});const denied=await page.request.post(`${base}/${meter.id}/tariffs`,{headers:h,form:{validFrom:"2026-03-01",price:"1",advance:"1"}});expect(denied.status()).toBe(403);expect(await db.meterTariff.count({where:{meterId:meter.id}})).toBe(1);
 await page.goto(`/nemovitosti/${property.id}/vzhled?unitId=${own.id}`);await expect(page.getByRole("heading",{name:"Upravit kartu"})).toBeVisible();await expect(page.getByLabel("Avatar objektu / jednotky")).toHaveValue("icon");await expect(page.getByRole("option",{name:"Automaticky",exact:true})).toHaveCount(0);
 const sharp=(await import("sharp")).default;const avatar=await sharp({create:{width:20,height:30,channels:3,background:{r:90,g:130,b:200}}}).png().toBuffer();
 await page.request.post(`/api/properties/${property.id}/appearance`,{headers:h,multipart:{unitId:own.id,photoId:"upload",avatar:{name:"avatar.png",mimeType:"image/png",buffer:avatar}}});const appearance=await db.userEntityAppearance.findUniqueOrThrow({where:{userId_entityKey:{userId:user.id,entityKey:`unit:${own.id}`}}});expect(appearance.avatarMimeType).toBe("image/webp");expect((await sharp(appearance.avatarData!).metadata()).width).toBe(320);const image=await page.request.get(`/api/entity-avatar?key=unit:${own.id}`,{headers:h});expect(image.status()).toBe(200);expect(image.headers()["cache-control"]).toBe("private, no-store");
 await page.goto(`/nemovitosti/${property.id}/reporting?unitId=${own.id}`);await expect(page).toHaveURL(new RegExp(`/reporty\\?.*unitId=${own.id}`));await expect(page.locator("main")).not.toContainText(other.label);
 }finally{
 // Readings and their authors are immutable history. Archive only these isolated CI fixtures; the disposable database owns their lifecycle.
 await db.property.update({where:{id:property.id},data:{active:false}});await db.user.update({where:{id:user.id},data:{active:false}});
 }
});
