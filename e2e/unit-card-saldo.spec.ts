import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

test("unit overview shows tenant, real overpayment and ordered modules on desktop and mobile", async ({ page }, testInfo) => {
  const url=process.env.DATABASE_URL;
  if(!url || !["localhost","127.0.0.1","postgres"].includes(new URL(url).hostname)) throw new Error("Isolated CI database required");
  const db=new PrismaClient();
  try {
    const tag=`R24_AGENT_QA_2026_09 unit saldo ${crypto.randomUUID().slice(0,8)}`;
    const owner=await db.owner.create({data:{name:tag}});
    const property=await db.property.create({data:{ownerId:owner.id,name:tag,address:"Syntetická 2",city:"Praha"}});
    const unit=await db.unit.create({data:{propertyId:property.id,label:"Saldo QA",areaM2:50}});
    const vacant=await db.unit.create({data:{propertyId:property.id,label:"Volná QA"}});
    const tenant=await db.tenant.create({data:{name:"Nájemce saldo QA"}});
    const lease=await db.lease.create({data:{unitId:unit.id,tenantId:tenant.id,startDate:new Date("2020-01-01T12:00:00Z"),financialTrackingFromPeriod:"2020-01",variableSymbol:tag,rentCents:1000000,servicesCents:100000,depositCents:2000000,contractNumber:tag}});
    const charge=await db.charge.create({data:{leaseId:lease.id,period:"2020-01",dueDate:new Date("2020-01-05T12:00:00Z"),amountCents:1100000}});
    const account=await db.bankAccount.create({data:{propertyId:property.id,provider:"manual",bankName:"QA",externalAccountId:tag,ibanMasked:"QA"}});
    await db.bankTransaction.create({data:{bankAccountId:account.id,externalId:tag,bookedAt:new Date("2020-01-06T12:00:00Z"),amountCents:1310000,source:"manual",status:"OVERPAYMENT",suggestedLeaseId:lease.id,allocations:{create:{chargeId:charge.id,amountCents:1100000}}}});
    const paidUnit=await db.unit.create({data:{propertyId:property.id,label:"Uhrazený předpis QA"}});
    const paidLease=await db.lease.create({data:{unitId:paidUnit.id,tenantId:tenant.id,startDate:new Date("2020-01-01T12:00:00Z"),financialTrackingFromPeriod:"2020-01",variableSymbol:`${tag}-paid`,rentCents:1000000,servicesCents:0}});
    const paidCharge=await db.charge.create({data:{leaseId:paidLease.id,period:"2099-01",dueDate:new Date("2099-01-05T12:00:00Z"),amountCents:1000000}});
    await db.bankTransaction.create({data:{bankAccountId:account.id,externalId:`${tag}-paid`,bookedAt:new Date("2020-01-06T12:00:00Z"),amountCents:1000000,source:"manual",status:"MATCHED",suggestedLeaseId:paidLease.id,allocations:{create:{chargeId:paidCharge.id,amountCents:1000000}}}});
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(process.env.E2E_ADMIN_EMAIL||"e2e.admin@flatcloud.test");
    await page.getByLabel("Heslo").fill(process.env.E2E_ADMIN_PASSWORD||"FlatCloud-E2E-Only-Password-2026");
    await page.getByRole("button",{name:"Přihlásit se",exact:true}).click();
    await expect(page).toHaveURL(/\/portfolio/);
    await page.goto(`/nemovitosti/${property.id}/jednotky/${unit.id}`);
    const kpis=page.locator(".unit-overview-kpis");
    await expect(kpis.locator(".mini-kpi")).toHaveCount(4);
    await expect(kpis.locator(".status-occupied strong")).toHaveText(tenant.name);
    await expect(kpis.locator(".status-occupied small")).toHaveText("Obsazená");
    await expect(kpis.locator(".unit-balance-kpi strong")).toHaveText(/\+2\s*100\s*Kč/);
    await expect(kpis.locator(".unit-balance-kpi small")).toContainText("Přeplatek");
    await expect(page.locator("#smlouva")).toContainText("Sjednaná kauce");
    await expect(page.locator("#smlouva")).toContainText("Nájemné a platební podmínky");
    const labels=["Přehled","Smlouva","Osoby","Předpisy","Platby","Upomínky","Měřidla","Dokumenty","Kvalita a Capex","Osobní hodnota"];
    await expect(page.locator(".unit-tabs a")).toHaveText(labels);
    const ids=["prehled","smlouva","osoby","predpisy","platby","komunikace","meridla","dokumenty","kvalita","osobni-hodnota"];
    const tops=await page.evaluate(ids=>ids.map(id=>document.getElementById(id)!.getBoundingClientRect().top),ids);
    expect(tops).toEqual([...tops].sort((a,b)=>a-b));
    for (const selector of [".unit-occupancy-details", ".unit-area-details"]) {
      const history=page.locator(selector);
      await expect(history).not.toHaveAttribute("open", "");
      await expect(history.locator(".unit-history-panel")).toBeHidden();
      await history.locator("summary").click();
      await expect(history.locator(".unit-history-panel")).toBeVisible();
      const widths=await history.evaluate(el=>({history:el.getBoundingClientRect().width,panel:el.querySelector(".unit-history-panel")!.getBoundingClientRect().width}));
      expect(Math.abs(widths.history-widths.panel)).toBeLessThan(2);
      await history.locator("summary").click();
    }
    for (const [before,after] of [["predpisy","platby"],["kvalita","osobni-hodnota"]]) {
      const gap=await page.evaluate(([before,after])=>document.getElementById(after)!.getBoundingClientRect().top-document.getElementById(before)!.getBoundingClientRect().bottom,[before,after]);
      expect(gap).toBeGreaterThanOrEqual(16);
    }
    const quality=page.locator("#kvalita");
    await quality.getByText("Ohodnotit jednotku a naplánovat obnovu",{exact:true}).click();
    await quality.getByLabel("Kvalita jednotky *").selectOption("B_GOOD");
    await quality.getByLabel("Odhad CAPEX Kč").fill("12000");
    await quality.getByRole("button",{name:"Uložit hodnocení",exact:true}).click();
    await expect(page.getByText("Hodnocení kvality a plánu obnovy bylo uloženo.",{exact:true})).toBeVisible();
    await quality.getByText("Upravit hodnocení a plán obnovy",{exact:true}).click();
    await expect(quality.getByLabel("Odhad CAPEX Kč")).toHaveValue("12000.00");
    await kpis.locator(".unit-balance-kpi").click();
    await expect(page).toHaveURL(/#saldo$/);
    await expect(page.locator("#saldo")).toBeInViewport();
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
    await expect(page.locator("#smlouva .unit-contract-fields").first()).toHaveCSS("grid-template-columns",/^[\d.]+px$/);
    await page.goto(`/nemovitosti/${property.id}/jednotky/${vacant.id}`);
    await expect(page.locator(".status-vacant strong")).toHaveText("Neobsazená");
    await expect(page.locator(".unit-overview-kpis .mini-kpi")).toHaveCount(4);
    await expect(page.getByText("Historie plochy pro rozúčtování",{exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
    await page.goto(`/nemovitosti/${property.id}/jednotky/${paidUnit.id}`);
    await expect(page.locator(".unit-balance-kpi strong")).toHaveText(/0\s*Kč/);
    await expect(page.locator(".unit-balance-kpi small")).toContainText("Vyrovnáno");
    // The same financial fixtures must retain their meaning in the simpler Basic view.
    await page.goto(`/nemovitosti/${property.id}/jednotky/${unit.id}`);
    await page.locator('.display-mode-switch-mobile button[value="basic"]').click();
    await expect(page).toHaveURL(new RegExp(`/jednotky/${unit.id}$`));
    await expect(page.locator(".basic-unit-summary .basic-unit-tile")).toHaveCount(3);
    await expect(page.locator(".basic-unit-tenant strong")).toHaveText(tenant.name);
    await expect(page.locator(".basic-unit-balance strong")).toHaveText(/\+2\s*100\s*Kč/);
    await expect(page.locator(".basic-unit-details")).not.toHaveAttribute("open", "");
    await page.locator(".basic-unit-balance").click();
    await expect(page.locator("#saldo")).toBeVisible();
    await expect(page.locator("#saldo")).toBeInViewport();
    await page.goto(`/nemovitosti/${property.id}/jednotky/${unit.id}#meridla`);
    await expect(page.locator("#meridla")).toBeVisible();
    await page.goto(`/nemovitosti/${property.id}/jednotky/${vacant.id}`);
    await expect(page.locator(".basic-unit-status")).toHaveText("Neobsazená");
    await expect(page.locator(".basic-unit-balance p")).toHaveText("Bez aktuální smlouvy");
    await expect(page.locator(".basic-unit-actions").getByRole("link", {name: /Založit smlouvu/})).toHaveAttribute("href", `/nemovitosti/${property.id}/smlouvy/nova?unitId=${vacant.id}`);
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({width,height:1000});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
      await expect(page.locator(".basic-unit-cover .entity-avatar-illustration")).toHaveCSS("background-size","cover");
    }
    await page.setViewportSize({width:1440,height:1000});
    const berry = page.locator(".basic-sidebar-berry");
    await expect(berry).toBeVisible();
    expect(await berry.evaluate(el=>el.nextElementSibling?.classList.contains("display-mode-switch"))).toBeTruthy();
    const desktopLayout = () => page.evaluate(() => {
      const selectors = [".sidebar", ".main", ".page", ".basic-unit-hero", ".basic-unit-summary", ".basic-unit-details"];
      return {width:innerWidth, scrollX, boxes:Object.fromEntries(selectors.map(selector => {
        const element=document.querySelector(selector)!;
        const rect=element.getBoundingClientRect();
        return [selector,{left:rect.left,right:rect.right,width:rect.width,animations:element.getAnimations().filter(animation=>animation.playState==="running").length}];
      }))};
    });
    const captureDesktop = async (name: string) => {
      // A geometry read may see the destination style before Chromium starts its transition.
      // Wait for two rendered frames and for both the shell and its contents to settle.
      await page.evaluate(() => new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      await expect.poll(async () => {
        const layout=await desktopLayout();
        return layout.scrollX===0 && Object.entries(layout.boxes).every(([selector,box]) =>
          box.animations===0 && (selector===".sidebar" || (box.left>=layout.boxes[".sidebar"].right-1 && box.right<=layout.width+1)));
      }).toBeTruthy();
      const before=await desktopLayout();
      await page.screenshot({path:`test-results/${name}-viewport.png`,animations:"disabled"});
      await page.screenshot({path:`test-results/${name}-desktop.png`,fullPage:true,animations:"disabled"});
      const after=await desktopLayout();
      await testInfo.attach(`${name}-layout`,{body:JSON.stringify({before,after},null,2),contentType:"application/json"});
      expect(after.boxes[".basic-unit-hero"].left).toBeGreaterThanOrEqual(after.boxes[".sidebar"].right);
    };
    await captureDesktop("basic-unit-vacant");
    await page.goto(`/nemovitosti/${property.id}/jednotky/${unit.id}`);
    await expect(page.locator(".basic-unit-tenant strong")).toHaveText(tenant.name);
    await expect(page.locator(".basic-unit-details")).not.toHaveAttribute("open", "");
    await captureDesktop("basic-unit-approved");
    await page.locator('.sidebar .display-mode-switch button[value="pro"]').click();
    await expect(berry).toHaveCount(0);
    await expect(page.locator(".unit-overview-kpis .mini-kpi")).toHaveCount(4);
    // Unpaid overdue rent stays red in Basic; future paid rent remains balanced.
    await db.charge.create({data:{leaseId:paidLease.id,period:"2020-02",dueDate:new Date("2020-02-05T12:00:00Z"),amountCents:350000}});
    await page.goto(`/nemovitosti/${property.id}/jednotky/${paidUnit.id}`);
    await page.locator('.sidebar .display-mode-switch button[value="basic"]').click();
    await expect(page.locator(".basic-unit-balance")).toHaveClass(/balance-debt/);
    await expect(page.locator(".basic-unit-balance strong")).toHaveText(/−?-?3\s*500\s*Kč/);
    await page.locator('.sidebar .display-mode-switch button[value="pro"]').click();
  } finally { await db.$disconnect(); }
});
