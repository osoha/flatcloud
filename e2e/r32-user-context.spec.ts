import { canViewReportingGroup } from "../lib/reporting/access";
import { expect, test, type Page } from "@playwright/test";
import { Script, createContext } from "node:vm";
import { houseAvatarTemplate } from "../lib/skills/house-avatar-template";
import { isFlatcloudMember, previewRequestAllowed } from "../lib/user-context-policy";
const email = process.env.E2E_ADMIN_EMAIL || "e2e.admin@flatcloud.test";
const password = process.env.E2E_ADMIN_PASSWORD || "FlatCloud-E2E-Only-Password-2026";
async function login(page: Page, address = email) {
  await page.goto("/login");
  await page.getByLabel("E-mail", {exact:true}).fill(address);
  await page.getByLabel("Heslo", {exact:true}).fill(password);
  await page.getByRole("button", {name:"Přihlásit se",exact:true}).click();
  await expect(page).toHaveURL(/\/portfolio/);
}
async function headers(page:Page) {return {Cookie:(await page.context().cookies()).map(c=>`${c.name}=${c.value}`).join("; ")};}

test("R32B: membership and read-only policy fail closed; approved map logic parses and validates selection", () => {
  const member = {id:"u",role:"OWNER_VIEWER",reportingGroupMemberships:[{reportingGroupId:"g",permission:"ADMIN"}]};
  expect(canViewReportingGroup(member,"g")).toBe(false);
  expect(canViewReportingGroup({...member,flatcloudMember:true},"g")).toBe(true);
  expect(canViewReportingGroup({...member,flatcloudMember:true},"other")).toBe(false);
  expect(isFlatcloudMember({role:"MANAGER"})).toBe(false);
  expect(isFlatcloudMember({role:"OWNER_VIEWER",flatcloudMember:true})).toBe(true);
  expect(isFlatcloudMember({role:"SUPER_ADMIN"})).toBe(true);
  for(const method of ["POST","PATCH","PUT","DELETE"]) {
    expect(previewRequestAllowed(method,"/api/properties/example")).toBe(false);
    expect(previewRequestAllowed(method,"/portfolio")).toBe(false);
  }
  expect(previewRequestAllowed("POST","/api/admin/user-preview/exit")).toBe(true);
  expect(previewRequestAllowed("POST","/api/admin/skills/maps-key")).toBe(false);
  const scripts=[...houseAvatarTemplate.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
  for(const script of scripts) new Script(script[1]);
  const context=createContext({}); new Script(scripts[0][1]).runInContext(context);
  const probe=context.FlatBerryProbe;
  expect(probe.headings(45)).toEqual([45,135,225,315]);
  expect(probe.canSelect(probe.initial())).toBe(false);
  let state=probe.reduce(probe.initial(),{type:"START"});
  state=probe.reduce(state,{type:"STEADY"});
  state=probe.reduce(state,{type:"CONFIRM_TARGET",value:true});
  state=probe.reduce(state,{type:"REVIEW",value:"3d"});
  expect(probe.canSelect(state)).toBe(true);
  expect(probe.canSelect(probe.reduce(state,{type:"ERROR"}))).toBe(false);
  expect(probe.canSelect(probe.reduce(state,{type:"MOVING"}))).toBe(false);
});

test("R32B: target content, actual sidebar, blocked writes, no target heartbeat, revoked preview and exit", async ({page}) => {
  test.skip(Boolean(process.env.E2E_BASE_URL),"Isolated database fixtures only.");
  const { prisma } = await import("../lib/db");
  const admin=await prisma.user.findUniqueOrThrow({where:{email}});
  const target=await prisma.user.create({data:{email:`r32-preview-${Date.now()}@example.test`,name:"R32 Externí náhled",passwordHash:admin.passwordHash,role:"OWNER_VIEWER",flatcloudMember:false}});
  try {
    await login(page);
    await page.goto(`/uzivatele/${target.id}`);
    await page.getByRole("button",{name:"Pohled uživatele",exact:true}).click();
    await expect(page.getByRole("region",{name:"Pohled uživatele",exact:true})).toContainText(target.name);
    const administration = page.locator(".sidebar").getByRole("button",{name:"Správa",exact:true});
    await expect(administration).toBeVisible();
    if (await administration.getAttribute("aria-expanded") === "false") await administration.click();
    await expect(page.locator(".sidebar").getByRole("link",{name:"Administrace",exact:true})).toBeVisible();
    await expect(page.locator("main")).not.toContainText("KPI FlatCloud");
    await expect(page.locator("main")).toContainText("Zatím nejsou evidované nemovitosti");
    const h=await headers(page);
    for(const path of ["/api/users/"+target.id,"/api/properties","/portfolio","/api/admin/skills/maps-key"]) {
      const response=await page.request.post(path,{headers:h,data:{name:"FORBIDDEN"},maxRedirects:0});
      expect(response.status(),path).toBe(403);
    }
    expect((await page.request.get("/api/admin/skills/maps-key?use=sdk",{headers:h})).status()).toBe(403);
    expect((await page.request.post("/api/account/activity",{headers:h})).status()).toBe(204);
    expect(await prisma.userActivity.findUnique({where:{userId:target.id}})).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({where:{id:target.id}})).name).toBe(target.name);
    await page.goto("/reporty?view=asset");
    await expect(page.locator("main")).not.toContainText("FlatCloud Asset");
    await page.goto("/dovednosti");
    await expect(page.getByRole("heading",{name:"Správa zůstává administrátorovi"})).toBeVisible();
    await prisma.user.update({where:{id:target.id},data:{active:false}});
    await page.goto("/portfolio");
    await expect(page.getByRole("region",{name:"Pohled uživatele",exact:true})).toContainText("Náhled již není platný");
    await page.getByRole("button",{name:"Ukončit náhled"}).click();
    await expect(page).toHaveURL(/\/uzivatele/);
    await expect(page.getByRole("region",{name:"Pohled uživatele",exact:true})).toHaveCount(0);
  } finally {await prisma.user.delete({where:{id:target.id}});}
});

test("R32C: explicit membership gates direct corporate routes even with group grants; editor preserves object grants",async({page})=>{
  test.skip(Boolean(process.env.E2E_BASE_URL),"Isolated database fixtures only.");
  const {prisma}=await import("../lib/db");
  const admin=await prisma.user.findUniqueOrThrow({where:{email}});
  const property=await prisma.property.findFirstOrThrow({where:{active:true}});
  const target=await prisma.user.create({data:{email:`r32-member-${Date.now()}@example.test`,name:"R32 Členství",passwordHash:admin.passwordHash,role:"OWNER_VIEWER",flatcloudMember:false,memberships:{create:{propertyId:property.id,permission:"VIEW"}}}});
  const group=await prisma.reportingGroup.create({data:{name:"R32 Vyhrazená skupina",members:{create:{userId:target.id,permission:"EDIT"}}}});
  try {
    await login(page,target.email);
    await expect(page.getByRole("link",{name:"Akcionářské reporty",exact:true})).toHaveCount(0);
    expect((await page.request.get("/api/reporting-groups/"+group.id+"/annual-reports/fake/assets/download",{headers:{...await headers(page),"x-flatberry-path":"/portfolio"},maxRedirects:0})).status()).toBe(401);
    for(const path of ["/reporty/kvartalni","/distribuce"]) {await page.goto(path);await expect(page).toHaveURL(/\/portfolio/);}
    for(const path of ["/dovednosti","/dovednosti/avatary-domu","/dovednosti/avatary-domu/nastroj","/api/admin/skills/maps-key?use=sdk"]) {
      const response=await page.request.get(path,{headers:await headers(page),maxRedirects:0}); expect([403,404]).toContain(response.status());
    }
    await page.request.post("/api/auth/logout",{headers:await headers(page)});
    await login(page);
    await page.goto(`/uzivatele/${target.id}`);
    await page.getByLabel("Uživatel patří do skupiny FlatCloud").check();
    await page.locator('input[name="confirmAccessChange"]').check();
    await page.locator('[data-testid="user-access-form"] button[type="submit"]').click();
    await expect(page).toHaveURL(/ok=/);
    const updated=await prisma.user.findUniqueOrThrow({where:{id:target.id},include:{memberships:true}});
    expect(updated.flatcloudMember).toBe(true);expect(updated.role).toBe("OWNER_VIEWER");
    expect(updated.memberships).toHaveLength(1);expect(updated.memberships[0].permission).toBe("VIEW");
    await page.request.post("/api/auth/logout",{headers:await headers(page)});
    await login(page,target.email);
    await expect(page.getByRole("link",{name:"Akcionářské reporty",exact:true})).toBeVisible();
  } finally {await prisma.reportingGroup.delete({where:{id:group.id}});await prisma.user.delete({where:{id:target.id}});}
});

test("R32D: private encrypted map key persists, isolates accounts, forgets, and never enters tool HTML",async({page})=>{
  test.skip(Boolean(process.env.E2E_BASE_URL),"Isolated database fixtures only.");
  const {prisma}=await import("../lib/db");
  const admin=await prisma.user.findUniqueOrThrow({where:{email}});
  const saved=await prisma.userPrivateToolSettings.findUnique({where:{userId:admin.id}});
  const other=await prisma.user.create({data:{email:`r32-other-admin-${Date.now()}@example.test`,name:"R32 Druhý admin",passwordHash:admin.passwordHash,role:"SUPER_ADMIN"}});
  const key="R32_TEST_ONLY_NOT_A_REAL_GOOGLE_KEY_12345";
  try {
    await login(page);
    await page.goto("/dovednosti/avatary-domu");
    const frame=page.frameLocator('iframe[title="Výběr 3D pohledu a výřezu domu"]');
    await frame.getByLabel("Google Maps API klíč",{exact:true}).fill(key);
    await frame.getByRole("button",{name:"Uložit klíč",exact:true}).click();
    await expect(frame.locator("#key-state")).toContainText("Soukromý klíč je uložený");
    await page.reload();
    await expect(frame.locator("#key-state")).toContainText("Soukromý klíč je uložený");
    await expect(frame.locator("#key")).toHaveValue("");
    const record=await prisma.userPrivateToolSettings.findUniqueOrThrow({where:{userId:admin.id}});
    expect(record.mapsKeyEncrypted).not.toContain(key);expect(record.mapsKeyEncrypted).toMatch(/^v1\./);
    const html=await page.request.get("/dovednosti/avatary-domu/nastroj",{headers:await headers(page)});
    expect(html.headers()["x-frame-options"]).toBe("SAMEORIGIN");
    expect(html.headers()["content-security-policy"]).toContain("frame-ancestors 'self'");
    expect(await html.text()).not.toContain(key);
    const usersPage=await page.request.get("/uzivatele",{headers:await headers(page)});
    expect(usersPage.headers()["x-frame-options"]).toBe("DENY");
    await page.request.post("/api/auth/logout",{headers:await headers(page)});
    await login(page,other.email);
    const settings=await page.request.get("/api/admin/skills/maps-key?use=sdk",{headers:await headers(page)});
    expect((await settings.json()).key).toBeNull();
    await page.request.post("/api/auth/logout",{headers:await headers(page)});
    await login(page);
    await page.goto("/dovednosti/avatary-domu");
    await expect(frame.locator("#key-state")).toContainText("Soukromý klíč je uložený");
    await frame.getByRole("button",{name:"Zapomenout",exact:true}).click();
    await expect(frame.locator("#key-state")).toContainText("Zatím není uložený klíč");
    expect((await prisma.userPrivateToolSettings.findUniqueOrThrow({where:{userId:admin.id}})).mapsKeyEncrypted).toBeNull();
  } finally {
    if(saved) await prisma.userPrivateToolSettings.update({where:{userId:admin.id},data:{mapsKeyEncrypted:saved.mapsKeyEncrypted}});
    else await prisma.userPrivateToolSettings.deleteMany({where:{userId:admin.id}});
    await prisma.user.delete({where:{id:other.id}});
  }
});

test("R32D: synthetic capture crops the confirmed square, retains source strip, and stops every track",async({page})=>{
  // Deterministic transport test, not evidence of live Google/WebGL coverage or permission consent.
  await page.goto("/login");
  await page.route("**/api/admin/skills/maps-key**",route=>route.fulfill({json:{configured:true,key:"SYNTHETIC_TEST_KEY"}}));
  await page.route("https://maps.googleapis.com/**",route=>route.fulfill({contentType:"application/javascript",body:`
    class FakeMap extends HTMLElement {
      constructor(opts){super();Object.assign(this,opts);this.style.cssText='display:block;width:100%;height:100%;background:rgb(30,70,200)'}
      flyCameraTo({endCamera}){Object.assign(this,endCamera);setTimeout(()=>{const event=new Event('gmp-steadychange');event.isSteady=true;this.dispatchEvent(event)},20)}
    }
    customElements.define('r32-test-map',FakeMap);
    window.google={maps:{importLibrary:async()=>({Map3DElement:FakeMap,AltitudeMode:{RELATIVE_TO_GROUND:'RELATIVE',ABSOLUTE:'ABSOLUTE'},MapMode:{SATELLITE:'SATELLITE'},GestureHandling:{COOPERATIVE:'COOPERATIVE'}})}};
    window.flatberryMapsLoaded();
  `}));
  await page.evaluate(()=>{
    const w=window as any;
    let handle="";
    Object.defineProperty(navigator.mediaDevices,"setCaptureHandleConfig",{configurable:true,value:(config:any)=>{handle=config.handle}});
    Object.defineProperty(navigator.mediaDevices,"getDisplayMedia",{configurable:true,value:async()=>{
      const source=document.createElement("canvas");source.width=innerWidth;source.height=innerHeight;
      const ctx=source.getContext("2d")!;
      const paint=()=>{
        ctx.fillStyle="rgb(240,0,0)";ctx.fillRect(0,0,source.width,source.height);
        const rect=document.getElementById("viewport")!.getBoundingClientRect();
        ctx.fillStyle="rgb(30,70,200)";ctx.fillRect(rect.x,rect.y,rect.width,rect.height);
        ctx.fillStyle="rgb(220,220,250)";ctx.fillRect(rect.x+rect.width/2-10,rect.y,20,rect.height-76);
        ctx.fillStyle="rgb(0,130,30)";ctx.fillRect(rect.x,rect.bottom-76,rect.width,76);
      };
      paint();const timer=setInterval(paint,30);const stream=source.captureStream(15),track=stream.getVideoTracks()[0];
      const stop=track.stop.bind(track);track.stop=()=>{w.captureStopped=true;clearInterval(timer);stop()};
      track.getSettings=()=>({displaySurface:"browser"});
      (track as any).getCaptureHandle=()=>({handle,origin:location.origin});
      return stream;
    }});
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,kind:any,...args:any[]){
      if(kind==="webgl2") return {getExtension:()=>null} as any;
      return original.call(this,kind,...args as []) as any;
    } as typeof original;
  });
  await page.setContent(houseAvatarTemplate);
  await expect(page.locator("#key-state")).toContainText("Soukromý klíč je uložený");
  await page.getByRole("button",{name:"Rychlý test: Onšovecká 427",exact:true}).click();
  await expect(page.locator("#status")).toContainText("Scéna je vykreslena");
  await page.locator("#confirmed").check();
  await page.getByRole("button",{name:"Vidím prostorové fasády a střechu",exact:true}).click();
  await page.getByRole("button",{name:"Použít tento pohled",exact:true}).click();
  await page.getByRole("button",{name:"Připravit výřez",exact:true}).click();
  await expect(page.locator("#export-preview")).toBeVisible();
  const pixels=await page.locator("#export-preview").evaluate(async(img:HTMLImageElement)=>{
    await img.decode();const canvas=document.createElement("canvas");canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
    const ctx=canvas.getContext("2d")!;ctx.drawImage(img,0,0);
    return {width:img.naturalWidth,height:img.naturalHeight,center:[...ctx.getImageData(400,400,1,1).data],source:[...ctx.getImageData(400,1010,1,1).data],stopped:(window as any).captureStopped};
  });
  expect(pixels.width).toBe(1024);expect(pixels.height).toBe(1024);
  expect(pixels.center.slice(0,3)).toEqual([30,70,200]);expect(pixels.source.slice(0,3)).toEqual([0,130,30]);expect(pixels.stopped).toBe(true);
  await expect(page.locator("#download-crop")).toBeDisabled();
  await page.locator("#export-confirm").check();
  await expect(page.locator("#download-crop")).toBeEnabled();
});
