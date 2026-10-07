import {test,expect} from "@playwright/test";
import {PrismaClient} from "@prisma/client";
import {randomUUID} from "node:crypto";
import bcrypt from "bcryptjs";
const db=new PrismaClient();
test.afterAll(()=>db.$disconnect());
test("sandbox communication examples fit desktop and mobile, and PDF preview requires an administrator",async({page},info)=>{
  if(!process.env.DATABASE_URL||!["localhost","127.0.0.1","postgres"].includes(new URL(process.env.DATABASE_URL).hostname))throw new Error("Isolated database required");
  test.skip(process.env.LEASE_CONTRACT_LOCAL_PILOT!=="1","Communication preview belongs to the contract sandbox");
  test.setTimeout(90000);
  const password="Communication-QA-Only-2026",user=await db.user.create({data:{email:`communication-${randomUUID()}@flatcloud.test`,name:"Náhled komunikace QA",passwordHash:await bcrypt.hash(password,8),role:"SUPER_ADMIN",isTestIdentity:true}});
  try {
    expect((await page.request.get("/api/admin/communication-preview")).status()).toBe(404);
    await page.goto("/login");await page.getByLabel("E-mail").fill(user.email);await page.getByLabel("Heslo",{exact:true}).fill(password);await page.getByRole("button",{name:"Přihlásit se",exact:true}).click();await expect(page).not.toHaveURL(/\/login/);
    await page.goto("/nastaveni/nahled-komunikace");await expect(page.getByRole("heading",{name:"Náhled komunikace",exact:true})).toBeVisible();
    await expect(page.locator("iframe")).toHaveCount(4);
    for(const width of [1280,390]) {
      await page.setViewportSize({width,height:900});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
      for(const title of ["Platební údaje","Připomenutí platby","Změna účtu","Zpráva k úkolu"]) {
        const frame=page.frameLocator(`iframe[title="${title}"]`);
        await expect(frame.locator("h1")).toBeVisible();
        expect(await frame.locator("body").evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
        const screenshot=info.outputPath(`mail-${title.replace(/\s/g,"-")}-${width}.png`);
        await page.locator(`iframe[title="${title}"]`).screenshot({path:screenshot});
        await info.attach(`mail-${title}-${width}`,{path:screenshot,contentType:"image/png"});
      }
    }
    const response=await page.request.get("/api/admin/communication-preview");expect(response.status()).toBe(200);expect(response.headers()["content-type"]).toBe("application/pdf");expect((await response.body()).subarray(0,4).toString()).toBe("%PDF");
    await info.attach("official-notice.pdf",{body:await response.body(),contentType:"application/pdf"});
    await db.user.update({where:{id:user.id},data:{role:"TENANT"}});
    expect((await page.request.get("/api/admin/communication-preview")).status()).toBe(404);
  }finally{await db.user.delete({where:{id:user.id}});}
});
