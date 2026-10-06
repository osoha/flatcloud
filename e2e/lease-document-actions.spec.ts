import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { leaseContractFixture } from "./fixtures/lease-contract";
import { CONTRACT_TEMPLATE_VERSION } from "../lib/lease-contracts/core";
import {
  publishPacket,
  completePacket,
  accessiblePacket,
  cancelPacket,
  savePersonalSignature,
  packetFile,
} from "../lib/lease-actions/service";
import { runLeaseActionReminders } from "../lib/lease-actions/reminders";

const db = new PrismaClient(),
  password = "Actions-QA-Only-2026",
  objects = new Map<string, Buffer>();
let storage: Server | undefined;
test.beforeAll(async () => {
  if (
    !process.env.DATABASE_URL ||
    !["localhost", "127.0.0.1", "postgres"].includes(
      new URL(process.env.DATABASE_URL).hostname,
    )
  )
    throw new Error("Isolated database required");
  if (
    process.env.FILE_STORAGE_DRIVER === "s3" &&
    process.env.S3_ENDPOINT === "http://127.0.0.1:3201"
  ) {
    storage = createServer(async (req, res) => {
      const key = new URL(req.url!, "http://127.0.0.1:3201").pathname;
      if (req.method === "PUT") {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(Buffer.from(c));
        objects.set(key, Buffer.concat(chunks));
        res.setHeader("ETag", '"qa"');
        res.end();
      } else if (req.method === "DELETE") {
        objects.delete(key);
        res.statusCode = 204;
        res.end();
      } else if (objects.has(key)) {
        res.setHeader("Content-Type", "application/pdf");
        res.end(req.method === "HEAD" ? undefined : objects.get(key));
      } else {
        res.statusCode = 404;
        res.end();
      }
    });
    await new Promise<void>((resolve) =>
      storage!.listen(3201, "127.0.0.1", resolve),
    );
  }
});
test.afterAll(async () => {
  if (storage)
    await new Promise<void>((resolve, reject) =>
      storage!.close((error) => (error ? reject(error) : resolve())),
    );
  await db.$disconnect();
});
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Heslo", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Přihlásit se", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
async function sessionHeaders(page: Page) {
  return {
    Cookie: (await page.context().cookies())
      .map((c) => `${c.name}=${c.value}`)
      .join("; "),
  };
}
async function fixture() {
  const tag = randomUUID(),
    passwordHash = await bcrypt.hash(password, 8);
  const admin = await db.user.create({
    data: {
      name: leaseContractFixture.landlord.signer,
      email: `actions-admin-${tag}@flatcloud.test`,
      role: "SUPER_ADMIN",
      passwordHash,
      isTestIdentity: true,
    },
  });
  const viewer = await db.user.create({
    data: {
      name: "Čtenář",
      email: `actions-viewer-${tag}@flatcloud.test`,
      role: "OWNER_VIEWER",
      allProperties: true,
      passwordHash,
      isTestIdentity: true,
    },
  });
  const user = await db.user.create({
    data: {
      name: "Jan Nájemník",
      email: `actions-tenant-${tag}@flatcloud.test`,
      role: "TENANT",
      passwordHash,
      isTestIdentity: true,
    },
  });
  const other = await db.user.create({
    data: {
      name: "Cizí nájemník",
      email: `actions-other-${tag}@flatcloud.test`,
      role: "TENANT",
      passwordHash,
      isTestIdentity: true,
    },
  });
  const owner = await db.owner.create({
    data: {
      type: "PERSON",
      name: admin.name,
      dateOfBirth: new Date("1975-06-14T12:00Z"),
      address: leaseContractFixture.landlord.address,
    },
  });
  const account = await db.ownerBankAccount.create({
    data: { ownerId: owner.id, accountNumber: "123456789", bankCode: "0800" },
  });
  const property = await db.property.create({
    data: {
      name: `TEST actions ${tag}`,
      address: "Jabloňová 25",
      city: "Praha",
      ownerId: owner.id,
      managerId: admin.id,
      ownershipMode: "UNIT_BASED",
    },
  });
  const unit = await db.unit.create({
    data: {
      label: "Byt 12",
      propertyId: property.id,
      type: "APARTMENT",
      areaM2: 54.5,
      ownerships: {
        create: { ownerId: owner.id, ownerBankAccountId: account.id },
      },
    },
  });
  const tenant = await db.tenant.create({
    data: {
      name: user.name,
      email: user.email,
      dateOfBirth: new Date("1995-05-10T12:00Z"),
      address: "Lipová 15, Praha",
      createdById: admin.id,
      propertyLinks: { create: { propertyId: property.id } },
    },
  });
  await db.tenantPortalAccess.create({
    data: { userId: user.id, tenantId: tenant.id },
  });
  const lease = await db.lease.create({
    data: {
      unitId: unit.id,
      tenantId: tenant.id,
      ownerBankAccountId: account.id,
      startDate: new Date("2026-11-01T12:00Z"),
      endDate: new Date("2027-10-31T12:00Z"),
      financialTrackingFromPeriod: "2026-11",
      rentCents: 1500000,
      servicesCents: 200000,
      depositCents: 3000000,
      variableSymbol: "100012",
      autoChargesEnabled: false,
    },
  });
  return {
    admin,
    viewer,
    user,
    other,
    owner,
    account,
    property,
    unit,
    tenant,
    lease,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function cleanup(f: Fixture) {
  const leaseIds = (
    await db.lease.findMany({
      where: { unit: { propertyId: f.property.id } },
      select: { id: true },
    })
  ).map((l) => l.id);
  const userIds = [f.admin.id, f.viewer.id, f.user.id, f.other.id];
  const packets = (
    await db.leaseActionPacket.findMany({
      where: { leaseId: { in: leaseIds } },
      select: { id: true },
    })
  ).map((p) => p.id);
  const assets = (
    await db.document.findMany({
      where: { leaseId: { in: leaseIds } },
      select: { fileAssetId: true },
    })
  ).map((d) => d.fileAssetId);
  await db.leaseActionRecipient.deleteMany({
    where: { packetId: { in: packets } },
  });
  await db.leaseActionPacket.deleteMany({ where: { id: { in: packets } } });
  await db.contractSignatureProfile.deleteMany({
    where: { userId: { in: userIds } },
  });
  await db.document.deleteMany({ where: { leaseId: { in: leaseIds } } });
  await db.fileAsset.deleteMany({ where: { id: { in: assets } } });
  await db.task.deleteMany({ where: { leaseId: { in: leaseIds } } });
  await db.leaseLandlordPeriod.deleteMany({
    where: { leaseId: { in: leaseIds } },
  });
  await db.auditLog.deleteMany({
    where: { OR: [{ userId: { in: userIds } }, { propertyId: f.property.id }] },
  });
  await db.tenantPortalAccess.deleteMany({ where: { tenantId: f.tenant.id } });
  await db.lease.deleteMany({ where: { id: { in: leaseIds } } });
  await db.tenant.delete({ where: { id: f.tenant.id } });
  await db.unit.deleteMany({ where: { propertyId: f.property.id } });
  await db.property.delete({ where: { id: f.property.id } });
  await db.ownerBankAccount.delete({ where: { id: f.account.id } });
  await db.owner.delete({ where: { id: f.owner.id } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
}
const message = {
  kind: "NON_RENEWAL",
  title: "Nepokračování nájmu",
  body: "Nájem končí 31. 10. 2027. Předání domluvíme na tel. 123. Oznámení nájem nezkracuje.",
  confirmed: true,
};

test("tenant account uses portal navigation, changes only own password and disables preview writes", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120000);
  const f = await fixture();
  try {
    await login(page, f.user.email);
    await page.goto(`/portal/najemnik/${f.tenant.id}`);
    expect(await page.content()).not.toContain(f.user.passwordHash);
    await expect(
      page
        .getByRole("navigation", { name: "Portál nájemníka" })
        .getByRole("link", { name: "Můj účet", exact: true }).last(),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Můj účet", exact: true })
      .last()
      .click();
    await expect(page).toHaveURL(/\/portal\/najemnik\/ucet/);
    await expect(
      page.getByRole("heading", { name: "Změna hesla", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Můj podpis", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Portfolio", exact: true }),
    ).toHaveCount(0);
    const oldHeaders = await sessionHeaders(page),
      nextPassword = "Actions-QA-Changed-2026";
    await page.getByLabel("Současné heslo", { exact: true }).fill(password);
    await page.getByLabel("Nové heslo", { exact: true }).fill(nextPassword);
    await page
      .getByLabel("Nové heslo znovu", { exact: true })
      .fill(nextPassword);
    await page
      .getByRole("button", { name: "Změnit heslo", exact: true })
      .click();
    await expect(page).toHaveURL(/\/portal\/najemnik\/ucet\?changed=1/);
    expect(
      await bcrypt.compare(
        nextPassword,
        (await db.user.findUniqueOrThrow({ where: { id: f.user.id } }))
          .passwordHash,
      ),
    ).toBe(true);
    expect(
      await bcrypt.compare(
        password,
        (await db.user.findUniqueOrThrow({ where: { id: f.admin.id } }))
          .passwordHash,
      ),
    ).toBe(true);
    expect(
      (
        await page.request.get("/api/portal/signature", { headers: oldHeaders })
      ).status(),
    ).toBe(403);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: info.outputPath("tenant-account-mobile.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    const context = await browser.newContext(),
      staff = await context.newPage();
    try {
      await login(staff, f.admin.email);
      await staff.goto(`/portal/najemnik/${f.tenant.id}`);
      await staff
        .getByRole("link", { name: "Můj účet nájemníka – náhled", exact: true })
        .click();
      await expect(
        staff.getByText("Heslo mění pouze přihlášený nájemník", {
          exact: false,
        }),
      ).toBeVisible();
      await expect(
        staff.locator('form[action="/api/account/password"]'),
      ).toHaveCount(0);
      await expect(
        staff.locator('form[action="/api/portal/signature"]'),
      ).toHaveCount(0);
      await staff.request.post("/api/admin/user-preview", {
        headers: await sessionHeaders(staff),
        form: { userId: f.user.id },
        maxRedirects: 0,
      });
      expect(
        (
          await staff.request.post("/api/account/password", {
            headers: await sessionHeaders(staff),
            form: {
              currentPassword: nextPassword,
              newPassword: "Another-QA-2026",
              confirmPassword: "Another-QA-2026",
            },
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await staff.request.post("/api/portal/signature", {
            headers: await sessionHeaders(staff),
            form: { ownSignature: "on", password: nextPassword },
          })
        ).status(),
      ).toBe(403);
    } finally {
      await context.close();
    }
  } finally {
    await cleanup(f);
  }
});

test("new/existing document choice redirects after one form and prefills known unit landlord", async ({
  page,
}) => {
  test.setTimeout(90000);
  const f = await fixture();
  try {
    await login(page, f.admin.email);
    for (const origin of ["NEW", "EXISTING"]) {
      const unit = await db.unit.create({
        data: {
          propertyId: f.property.id,
          label: `Volná ${origin}`,
          ownerships: {
            create: { ownerId: f.owner.id, ownerBankAccountId: f.account.id },
          },
        },
      });
      await page.goto(
        `/nemovitosti/${f.property.id}/smlouvy/nova?unitId=${unit.id}&tenantId=${f.tenant.id}`,
      );
      await expect(
        page.locator('input[name="documentOrigin"][value="NEW"]'),
      ).toBeChecked();
      await page
        .locator(`input[name="documentOrigin"][value="${origin}"]`)
        .check();
      await page.locator('select[name="tenantId"]').selectOption(f.tenant.id);
      await page.locator('input[name="startDate"]').fill("2027-11-01");
      await page
        .locator('input[name="variableSymbol"]')
        .fill(origin === "NEW" ? "778811" : "778812");
      await page.locator('input[name="rent"]').fill("15000");
      await page
        .getByRole("button", { name: "Vytvořit smlouvu", exact: true })
        .click();
      await expect(page).toHaveURL(origin === "NEW" ? /\/smlouvy\/[^/]+\/pripravit/ : /\/smlouvy\/[^/]+\?ok=.*#dokumenty/);
      const lease = await db.lease.findFirstOrThrow({
        where: { unitId: unit.id },
      });
      expect(lease.documentOrigin).toBe(origin);
      if (origin === "NEW") {
        await expect(page).toHaveURL(
          new RegExp(`/smlouvy/${lease.id}/pripravit`),
        );
        await expect(
          page.getByLabel("Jméno / název", { exact: true }),
        ).toHaveValue(f.owner.name);
        await expect(page.locator('input[type="date"]').first()).toHaveValue(
          "1975-06-14",
        );
        expect(
          await db.leaseLandlordPeriod.count({
            where: { leaseId: lease.id, ownerId: f.owner.id },
          }),
        ).toBe(1);
      } else
        await expect(page).toHaveURL(
          new RegExp(`/smlouvy/${lease.id}\\?ok=.*#dokumenty`),
        );
    }
  } finally {
    await cleanup(f);
  }
});

test("notice opening is separate from consent, scoped to current portal contact; reminders deduplicate", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120000);
  const f = await fixture();
  try {
    await expect(publishPacket(f.viewer, f.lease.id, message)).rejects.toThrow(
      /oprávnění/,
    );
    await expect(
      publishPacket(f.admin, f.lease.id, {
        ...message,
        body: "[doplňte pronajímatele]",
      }),
    ).rejects.toThrow(/nevyplněné/);
    const p = await publishPacket(f.admin, f.lease.id, {
      ...message,
      dueDate: "2027-10-02",
    });
    expect(await accessiblePacket(f.other, p.id)).toBeNull();
    await login(page, f.user.email);
    await page.request.get(`/portal/najemnik/potvrzeni/${p.id}`,{headers:await sessionHeaders(page)});
    expect((await db.leaseActionRecipient.findFirstOrThrow({where:{packetId:p.id}})).openedAt).toBeNull();
    await page.goto(`/portal/najemnik/potvrzeni/${p.id}`);
    await expect(
      page.getByText(/Nepotvrzuji tím souhlas/, { exact: false }).first(),
    ).toBeVisible();
    await expect.poll(async()=>Boolean((await db.leaseActionRecipient.findFirst({where:{packetId:p.id}}))?.openedAt)).toBe(true);
    const opened = await db.leaseActionRecipient.findFirstOrThrow({
      where: { packetId: p.id },
    });
    expect(opened.openedAt).not.toBeNull();
    expect(opened.completedAt).toBeNull();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: info.outputPath("notice-mobile.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    const headers = await sessionHeaders(page);
    expect(
      (
        await page.request.post(`/api/portal/actions/${p.id}`, {
          headers: { ...headers, Origin: "https://foreign.example" },
          form: { contentHash: p.contentHash, accepted: "on" },
        })
      ).status(),
    ).toBe(403);
    await expect(
      completePacket(f.user, p.id, {
        contentHash: "wrong",
        password: "",
        accepted: true,
      }),
    ).rejects.toThrow(/aktuální/);
    await db.tenant.update({
      where: { id: f.tenant.id },
      data: { communicationEmail: "revoked@example.test" },
    });
    expect(await accessiblePacket(f.user, p.id)).toBeNull();
    await expect(
      completePacket(f.user, p.id, {
        contentHash: p.contentHash,
        password: "",
        accepted: true,
      }),
    ).rejects.toThrow(/určen/);
    await db.tenant.update({
      where: { id: f.tenant.id },
      data: { communicationEmail: null },
    });
    const results = await Promise.all([
      completePacket(f.user, p.id, {
        contentHash: p.contentHash,
        password: "",
        accepted: true,
      }),
      completePacket(f.user, p.id, {
        contentHash: p.contentHash,
        password: "",
        accepted: true,
      }),
    ]);
    expect(results.map((r) => r.completed).reduce((a, b) => a + b, 0)).toBe(1);
    const receipt = await db.leaseActionRecipient.findUniqueOrThrow({
      where: { id: opened.id },
    });
    expect(receipt.signatureEncrypted).toBeNull();
    expect(receipt.evidenceHash).toHaveLength(64);
    expect(
      await db.auditLog.count({
        where: { entityId: p.id, action: "LEASE_ACTION_CONFIRMED" },
      }),
    ).toBe(1);
    await expect(cancelPacket(f.admin, p.id)).rejects.toThrow(/potvrzený/);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Potvrdit převzetí a přečtení" }),
    ).toHaveCount(0);
    const proof = await page.request.get(`/api/portal/actions/${p.id}`, {
      headers: await sessionHeaders(page),
    });
    expect(proof.status()).toBe(200);
    await info.attach("notice-confirmation-pdf", {
      body: await proof.body(),
      contentType: "application/pdf",
    });
    const foreign = await browser.newContext();
    expect(
      (await foreign.request.get(`/api/portal/actions/${p.id}`)).status(),
    ).toBe(403);
    await foreign.close();
    const pending = await publishPacket(f.admin, f.lease.id, {
      ...message,
      dueDate: "2027-10-02",
    });
    expect(
      (await runLeaseActionReminders(new Date("2027-10-05T12:00Z"), f.lease.id))
        .created,
    ).toBe(2);
    expect(
      (await runLeaseActionReminders(new Date("2027-10-05T12:00Z"), f.lease.id))
        .created,
    ).toBe(0);
    expect(
      await db.task.count({
        where: {
          dedupeKey: `lease-action-delivery:${pending.id}`,
          assigneeId: f.admin.id,
        },
      }),
    ).toBe(1);
    expect(
      (await runLeaseActionReminders(new Date("2027-11-01T12:00Z"), f.lease.id))
        .created,
    ).toBe(1);
    expect(
      (await db.lease.findUniqueOrThrow({ where: { id: f.lease.id } }))
        .terminatedOn,
    ).toBeNull();
    await cancelPacket(f.admin, pending.id);
    expect(
      await db.auditLog.count({
        where: { entityId: pending.id, action: "LEASE_ACTION_CANCELLED" },
      }),
    ).toBe(1);
  } finally {
    await cleanup(f);
  }
});

test("explicit tenant and landlord signatures freeze the exact PDF and personal image", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120000);
  test.skip(!storage, "Requires isolated S3 emulator");
  const f = await fixture();
  try {
    await login(page, f.admin.email);
    const saved = await page.request.post(
      `/api/leases/${f.lease.id}/contract`,
      {
        headers: await sessionHeaders(page),
        data: {
          mode: "save",
          input: leaseContractFixture,
          version: CONTRACT_TEMPLATE_VERSION,
        },
      },
    );
    expect(saved.status()).toBe(200);
    const doc = await db.document.findFirstOrThrow({
      where: { leaseId: f.lease.id },
      include: { fileAsset: true },
    });
    const key = `/qa-documents/${doc.fileAsset.storageKey}`,
      original = objects.get(key)!;
    const mismatch=await page.request.post(`/api/leases/${f.lease.id}/contract`,{headers:await sessionHeaders(page),data:{mode:"save",version:CONTRACT_TEMPLATE_VERSION,input:{...leaseContractFixture,tenancy:"JOINT",occupantCount:2,tenants:[...leaseContractFixture.tenants,{...leaseContractFixture.tenants[0],name:"Jana Jiná",birthDate:"1990-01-01"}]}}});
    expect(mismatch.status()).toBe(200);
    const mismatchDoc=await db.document.findFirstOrThrow({where:{leaseId:f.lease.id,id:{not:doc.id}}});
    await expect(publishPacket(f.admin,f.lease.id,{kind:"SIGN",title:"Chybný seznam osob",body:"Smlouva k podpisu",documentId:mismatchDoc.id,staffSignerId:f.admin.id,authority:"Osobně",confirmed:true})).rejects.toThrow(/jiné smluvní osoby/);
    const p = await publishPacket(f.admin, f.lease.id, {
      kind: "SIGN",
      title: "Nájemní smlouva",
      body: "Podepište konkrétní přiloženou smlouvu.",
      documentId: doc.id,
      staffSignerId: f.admin.id,
      authority: "Osobně jako pronajímatel",
      confirmed: true,
    });
    const tenantContext = await browser.newContext(),
      tenantPage = await tenantContext.newPage();
    try {
      await login(tenantPage, f.user.email);
      await tenantPage.goto("/portal/najemnik/podpis");
      const canvas = tenantPage.getByLabel(
          "Plocha pro kreslení osobního podpisu",
        ),
        box = (await canvas.boundingBox())!;
      await tenantPage.mouse.move(box.x + 30, box.y + 50);
      await tenantPage.mouse.down();
      await tenantPage.mouse.move(box.x + 120, box.y + 90, { steps: 10 });
      await tenantPage.mouse.move(box.x + 210, box.y + 40, { steps: 10 });
      await tenantPage.mouse.up();
      await tenantPage.locator('input[name="ownSignature"]').check();
      await tenantPage
        .getByLabel("Potvrzení heslem", { exact: true })
        .fill(password);
      await tenantPage
        .getByRole("button", { name: "Uložit vlastní podpis", exact: true })
        .click();
      await expect(tenantPage).toHaveURL(/\?ok=/);
      const profile = await db.contractSignatureProfile.findUniqueOrThrow({
        where: { userId: f.user.id },
      });
      expect(profile.encryptedImage).toMatch(/^v1\./);
      expect(profile.encryptedImage).not.toContain("data:image");
      await tenantPage.goto(`/portal/najemnik/potvrzeni/${p.id}`);
      await expect(
        completePacket(f.user, p.id, {
          contentHash: p.contentHash,
          password: "wrong",
          accepted: true,
        }),
      ).rejects.toThrow(/heslem/);
      objects.set(key, Buffer.from("tampered"));
      await expect(
        packetFile((await accessiblePacket(f.user, p.id))!),
      ).rejects.toThrow(/Kontrola/);
      objects.set(key, original);
      await tenantPage.locator('input[name="accepted"]').check();
      await tenantPage
        .getByLabel("Potvrzení podpisu heslem", { exact: true })
        .fill(password);
      await tenantPage
        .getByRole("button", { name: "Podepsat dokument", exact: true })
        .click();
      await expect(tenantPage).toHaveURL(/\?ok=/);
      const signed = await db.leaseActionRecipient.findFirstOrThrow({
        where: { packetId: p.id, tenantId: f.tenant.id },
      });
      expect(signed.signatureHash).toBe(profile.imageHash);
      expect(signed.completedById).toBe(f.user.id);
      expect(signed.completedAt).not.toBeNull();
      const png = await sharp(
        Buffer.from(
          '<svg width="500" height="100"><rect width="500" height="100" fill="white"/><path d="M20 40 L450 80" stroke="black" stroke-width="5"/></svg>',
        ),
      )
        .png()
        .toBuffer();
      await savePersonalSignature(
        f.user,
        `data:image/png;base64,${png.toString("base64")}`,
        password,
      );
      expect(
        (
          await db.contractSignatureProfile.findUniqueOrThrow({
            where: { userId: f.user.id },
          })
        ).imageHash,
      ).not.toBe(signed.signatureHash);
      expect(
        (
          await db.leaseActionRecipient.findUniqueOrThrow({
            where: { id: signed.id },
          })
        ).signatureEncrypted,
      ).toBe(signed.signatureEncrypted);
      await savePersonalSignature(
        f.admin,
        `data:image/png;base64,${png.toString("base64")}`,
        password,
      );
      await db.user.update({where:{id:f.admin.id},data:{role:"OWNER_VIEWER",allProperties:true}});
      await expect(completePacket(f.admin,p.id,{contentHash:p.contentHash,password,accepted:true})).rejects.toThrow(/změnil/);
      await db.user.update({where:{id:f.admin.id},data:{role:"SUPER_ADMIN",allProperties:false}});
      await page.goto(`/portal/najemnik/potvrzeni/${p.id}`);
      await page.locator('input[name="accepted"]').check();
      await page
        .getByLabel("Potvrzení podpisu heslem", { exact: true })
        .fill(password);
      await page
        .getByRole("button", { name: "Podepsat dokument", exact: true })
        .click();
      await expect(page).toHaveURL(/\?ok=/);
      await expect(
        page.getByText("Podepsáno všemi", { exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: info.outputPath("signed-contract-desktop.png"),
        fullPage: true,
      });
      const pdf = await page.request.get(`/api/portal/actions/${p.id}`, {
        headers: await sessionHeaders(page),
      });
      expect(pdf.status()).toBe(200);
      const bytes = await pdf.body();
      expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(
        (await PDFDocument.load(original)).getPageCount(),
      );
      await info.attach("signed-contract-proof-pdf", {
        body: bytes,
        contentType: "application/pdf",
      });
      expect(objects.get(key)).toEqual(original);
      expect(
        (
          await db.fileAsset.findUniqueOrThrow({
            where: { id: doc.fileAssetId },
          })
        ).sha256,
      ).toBe(doc.fileAsset.sha256);
      expect(
        await db.auditLog.count({
          where: { entityId: p.id, action: "LEASE_DOCUMENT_SIGNED" },
        }),
      ).toBe(2);
      await expect(cancelPacket(f.admin, p.id)).rejects.toThrow(/potvrzený/);
    } finally {
      await tenantContext.close();
    }
  } finally {
    await cleanup(f);
  }
});
