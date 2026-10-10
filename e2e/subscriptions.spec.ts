import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { PrismaClient, type Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { freshDefaultConfig, makeContract } from '../lib/subscriptions/policy';
import type { PlanCode } from '../lib/subscriptions/types';

const db = new PrismaClient();
const password = 'FlatBerry-Subscription-Isolated-2026';
const adminEmail = process.env.INITIAL_ADMIN_EMAIL || 'e2e.admin@flatcloud.test';
const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || 'FlatCloud-E2E-Only-Password-2026';
const pdf = Buffer.from('%PDF-1.4\nFlatBerry isolated receipt archive fixture\n%%EOF');

test.beforeAll(() => {
  if (!process.env.DATABASE_URL || !['localhost', '127.0.0.1', 'postgres'].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error('Subscription scenarios require an isolated local database.');
  if (process.env.FLATBERRY_SUBSCRIPTIONS_SANDBOX !== '1') throw new Error('Sandbox subscription flag must be explicit.');
});
test.beforeEach(async () => {
  const value = { ...freshDefaultConfig(), enabled: true, subscriptionBankAccount: 'QA-SUBSCRIPTION-ACCOUNT' } as unknown as Prisma.InputJsonObject;
  await db.subscriptionSetting.upsert({ where: { id: 'global' }, create: { id: 'global', value }, update: { value } });
});
test.afterAll(() => db.$disconnect());

async function login(page: Page, email: string, pass = password) {
  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Heslo', { exact: true }).fill(pass);
  await page.getByRole('button', { name: 'Přihlásit se', exact: true }).click();
  await expect(page).toHaveURL(/\/portfolio/);
}
// Production cookies are Secure. Chromium sends them on its trusted local
// origin; Playwright's standalone HTTP client requires an explicit session header.
function api(page: Page) {
  const headers = async () => ({ Cookie: (await page.context().cookies()).map(cookie => `${cookie.name}=${cookie.value}`).join('; ') });
  return {
    get: async (url: string, options: Parameters<Page['request']['get']>[1] = {}) => page.request.get(url, { ...options, headers: { ...await headers(), ...options.headers } }),
    post: async (url: string, options: Parameters<Page['request']['post']>[1] = {}) => page.request.post(url, { ...options, headers: { ...await headers(), ...options.headers } }),
  };
}

async function shot(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: page must not overflow`).toBe(true);
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true, animations: 'disabled' });
}

async function fixture(plan: PlanCode = 'FREE', units = 3) {
  const tag = randomUUID();
  const user = await db.user.create({ data: { name: 'Test předplatného', email: `subscriptions-${tag}@flatcloud.test`, passwordHash: await bcrypt.hash(password, 8), role: 'OWNER_VIEWER', isTestIdentity: true, defaultDisplayMode: 'pro' } });
  const owner = await db.owner.create({ data: { name: 'Vlastník testovacího portfolia', userId: user.id } });
  const property = await db.property.create({ data: { name: 'Dům pro test předplatného', address: 'Testovací 12', city: 'Praha', ownerId: owner.id, memberships: { create: { userId: user.id, permission: 'ADMIN' } } } });
  const rows = [];
  for (let i = 0; i < units; i++) rows.push(await db.unit.create({ data: { propertyId: property.id, label: `QA byt ${i + 1}`, ownerships: { create: { ownerId: owner.id, shareBasisPoints: 10000 } } } }));
  const tenant = await db.tenant.create({ data: { name: 'Testovací nájemník', email: `tenant-${tag}@flatcloud.test`, createdById: user.id } });
  const lease = await db.lease.create({ data: { unitId: rows[0].id, tenantId: tenant.id, startDate: new Date('2025-01-01'), financialTrackingFromPeriod: '2025-01', rentCents: 1000000, servicesCents: 0, variableSymbol: String(Date.now()).slice(-9) } });
  const charge = await db.charge.create({ data: { leaseId: lease.id, period: '2026-10', dueDate: new Date('2026-10-05'), amountCents: 1000000 } });
  const receipt = await db.tenantPaymentReceipt.create({ data: { chargeId: charge.id, issuerId: user.id, snapshotHash: tag, snapshot: { period: '2026-10', tenantName: tenant.name, issuerName: user.name }, pdfData: pdf } });
  const config = freshDefaultConfig();
  const account = await db.subscriptionAccount.create({ data: {
    payerUserId: user.id, ownerId: owner.id, billingName: user.name, billingEmail: user.email, plan,
    contract: makeContract(config, plan, units) as unknown as Prisma.InputJsonObject,
    scopes: { create: { propertyId: property.id, scopeKey: `P:${property.id}` } },
  } });
  const cleanup = async () => {
    const accounts = await db.subscriptionAccount.findMany({ where: { payerUserId: user.id }, select: { id: true } });
    const accountIds = accounts.map(item => item.id);
    await db.subscriptionPaymentEvent.deleteMany({ where: { request: { accountId: { in: accountIds } } } });
    await db.subscriptionPaymentRequest.deleteMany({ where: { accountId: { in: accountIds } } });
    await db.subscriptionAudit.deleteMany({ where: { OR: [{ accountId: { in: accountIds } }, { actorId: user.id }] } });
    await db.subscriptionScope.deleteMany({ where: { accountId: { in: accountIds } } });
    await db.subscriptionAccount.deleteMany({ where: { id: { in: accountIds } } });
    await db.tenantPaymentReceipt.deleteMany({ where: { issuerId: user.id } });
    await db.task.deleteMany({ where: { property: { ownerId: owner.id } } });
    await db.auditLog.deleteMany({ where: { OR: [{ userId: user.id }, { property: { ownerId: owner.id } }] } });
    await db.property.deleteMany({ where: { ownerId: owner.id } });
    await db.tenant.delete({ where: { id: tenant.id } });
    await db.owner.delete({ where: { id: owner.id } });
    await db.user.delete({ where: { id: user.id } });
  };
  return { user, owner, property, units: rows, tenant, lease, charge, receipt, account, cleanup };
}

test('Free uses native Basic and preview, blocks premium creation, preserves manual payments and receipt archives', async ({ page }, info) => {
  test.setTimeout(90000);
  const f = await fixture();
  try {
    await login(page, f.user.email);
    await page.goto(`/portfolio?properties=${f.property.id}`);
    await expect(page.locator('body')).toContainText(f.property.name);
    const mode = await api(page).post('/api/display-mode', { multipart: { mode: 'pro', returnTo: '/portfolio' }, maxRedirects: 0 });
    expect(mode.status()).toBe(303);
    await page.goto('/portfolio');
    await expect(page.locator('.app-shell')).toHaveClass(/basic-shell/);
    await shot(page, info, 'free-basic-portfolio');
    for (const path of [`/api/leases/${f.lease.id}/contract-preview`, `/api/leases/${f.lease.id}/receipts`, `/api/properties/${f.property.id}/matching`]) {
      const denied = await api(page).post(path, { multipart: { chargeId: f.charge.id }, maxRedirects: 0 });
      expect(denied.status(), path).toBe(403);
      expect((await denied.json()).subscriptionUrl).toBe('/ucet/predplatne');
    }
    const report = await api(page).get(`/api/reports/annual-owner-package.csv?properties=${f.property.id}`, { maxRedirects: 0 });
    expect(report.status()).toBe(403);
    const manual = await api(page).post('/api/payments/manual', { multipart: { leaseId: f.lease.id, idempotencyKey: randomUUID(), amount: '100', bookedAt: '2026-10-10' }, maxRedirects: 0 });
    expect(manual.status()).toBe(303);
    expect(manual.headers().location).toContain('ok=');
    expect(await db.bankTransaction.count({ where: { source: 'manual', suggestedLeaseId: f.lease.id } })).toBe(1);
    const archive = await api(page).get(`/api/leases/${f.lease.id}/receipts/${f.receipt.id}`);
    expect(archive.status()).toBe(200);
    expect(await archive.body()).toEqual(pdf);
    const raw = await api(page).get(`/api/subscriptions/export?accountId=${f.account.id}`);
    expect(raw.status()).toBe(200);
    expect(raw.headers()['content-disposition']).toContain('attachment');
    const freeExport = await raw.json();
    expect(freeExport.units.map((row: { id: string }) => row.id).sort()).toEqual(f.units.map(unit => unit.id).sort());
    expect(freeExport.charges.map((row: { id: string }) => row.id)).toContain(f.charge.id);
    expect(freeExport).not.toHaveProperty('tenants');
    const above = await api(page).post(`/api/properties/${f.property.id}/units`, { multipart: { ownerId: f.owner.id, label: 'Nad limit' }, maxRedirects: 0 });
    expect(above.status()).toBe(303);
    expect(above.headers().location).toContain('error=');
    expect(decodeURIComponent(above.headers().location)).toMatch(/kapacit|jednot|limit/i);
    expect(await db.unit.count({ where: { propertyId: f.property.id } })).toBe(3);
    const batch = await api(page).post(`/api/properties/${f.property.id}/units/batch`, { multipart: { ownerId: f.owner.id, units: 'Nad limit 1\nNad limit 2' }, maxRedirects: 0 });
    expect(batch.status()).toBe(303);
    expect(batch.headers().location).toContain('error=');
    expect(decodeURIComponent(batch.headers().location)).toMatch(/kapacit|jednot|limit/i);
    expect(await db.unit.count({ where: { propertyId: f.property.id } })).toBe(3);
    const forbiddenConfig = await api(page).post('/api/admin/subscriptions/config', { data: { operation: 'settings' } });
    expect(forbiddenConfig.status()).toBe(403);
    await api(page).post('/api/auth/logout');
    await login(page, adminEmail, adminPassword);
    await page.goto(`/uzivatele/${f.user.id}`);
    await expect(page.getByTestId('user-subscription-panel')).toBeVisible();
    await page.getByRole('button', { name: 'Pohled uživatele', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Pohled uživatele', exact: true })).toContainText(f.user.name);
    await expect(page.locator('.app-shell')).toHaveClass(/basic-shell/);
    const administration = page.locator('.sidebar').getByRole('button', { name: 'Správa', exact: true });
    await expect(administration).toBeVisible();
    if (await administration.getAttribute('aria-expanded') === 'false') await administration.click();
    await expect(page.locator('.sidebar').getByRole('link', { name: 'Administrace', exact: true })).toBeVisible();
    await page.goto('/ucet/predplatne');
    await expect(page.locator('main')).toContainText('Free');
    expect((await api(page).post('/api/subscriptions/request', { data: { accountId: f.account.id, method: 'CARD' }, maxRedirects: 0 })).status()).toBe(403);
    await shot(page, info, 'native-preview-subscription');
    await page.getByRole('button', { name: 'Ukončit náhled' }).click();
    await expect(page).toHaveURL(/\/uzivatele/);
  } finally { await f.cleanup(); }
});

test('super-admin has a native settings card and price changes preserve the existing agreed contract', async ({ page }, info) => {
  test.setTimeout(90000);
  const f = await fixture('PROFI', 1);
  try {
    await db.subscriptionAccount.update({ where: { id: f.account.id }, data: { paidUntil: new Date('2030-01-01') } });
    await login(page, adminEmail, adminPassword);
    await page.goto('/nastaveni');
    await page.locator('.admin-module-card').filter({ hasText: 'Tarify a předplatné' }).click();
    await expect(page).toHaveURL(/\/nastaveni\/tarify/);
    await shot(page, info, 'tariffs-default-desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    await shot(page, info, 'tariffs-default-mobile');
    await page.setViewportSize({ width: 1280, height: 720 });
    const form = page.getByTestId('subscription-plan-PROFI');
    await form.getByLabel('Měsíční cena v Kč včetně DPH').fill('299');
    await form.getByLabel('Důvod změny').fill('QA: cena pro nové zákazníky');
    await form.getByRole('button', { name: 'Uložit Profi', exact: true }).click();
    await expect(page).toHaveURL(/ok=/);
    const config = await (await api(page).get('/api/admin/subscriptions/config')).json();
    expect(config.plans.PROFI.monthlyPriceCents).toBe(29900);
    const saved = await db.subscriptionAccount.findUniqueOrThrow({ where: { id: f.account.id } });
    expect((saved.contract as unknown as { plan: { monthlyPriceCents: number } }).plan.monthlyPriceCents).toBe(24900);
    await shot(page, info, 'tariffs-desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    await shot(page, info, 'tariffs-mobile');
    const invalid = await api(page).post('/api/admin/subscriptions/config', { data: {
      operation: 'plan', planCode: 'PROFI', priceKc: '299', includedUnits: 10, additionalPriceKc: '25', maxProperties: '', 'feature:paymentMatching': true,
      reason: 'QA: invalid dependency',
    } });
    expect(invalid.status()).toBe(400);
    expect((await invalid.json()).error).toContain('notifikace');
    expect((await (await api(page).get('/api/admin/subscriptions/config')).json()).plans.PROFI.features.paymentMatching).toBe(true);
    await api(page).post('/api/auth/logout');
    await login(page, f.user.email);
    await page.goto(`/portfolio/kvalita?properties=${f.property.id}`);
    await expect(page).toHaveURL(/\/ucet\/predplatne\?reason=portfolioOversight/);
    await api(page).post('/api/auth/logout');
    await login(page, adminEmail, adminPassword);
    const override = await api(page).post(`/api/admin/subscriptions/user/${f.user.id}`, { data: {
      accountId: f.account.id, ownerId: f.owner.id, kind: 'OWN', plan: 'PROFI', interval: 'MONTHLY', capacityUnits: 10,
      billingName: f.user.name, billingEmail: f.user.email, propertyIds: [f.property.id], paidUntil: '2030-01-01',
      'override:portfolioOversight': 'on', reason: 'QA: výslovná časová výjimka', overridesUntil: '2030-01-01',
    } });
    expect(override.status()).toBe(200);
    expect((await override.json()).result.features.portfolioOversight).toBe(true);
    await api(page).post('/api/auth/logout');
    await login(page, f.user.email);
    await api(page).post('/api/display-mode', { multipart: { mode: 'basic', returnTo: '/portfolio' }, maxRedirects: 0 });
    await page.goto(`/portfolio/kvalita?properties=${f.property.id}`);
    await expect(page).toHaveURL(/\/portfolio\/kvalita/);
    await expect(page.locator('main')).toContainText(f.property.name);
    await expect(page.locator('.app-shell')).toHaveClass(/basic-shell/);
    const hidden = await db.property.findFirstOrThrow({ where: { ownerId: { not: f.owner.id }, active: true } });
    await page.goto(`/portfolio/kvalita?properties=${hidden.id}`);
    await expect(page.locator('main')).not.toContainText(hidden.name);
  } finally { await f.cleanup(); }
});

test('concurrent unit creation cannot exceed the final Free slot', async ({ page }) => {
  test.setTimeout(90000);
  const f = await fixture('FREE', 2);
  try {
    await login(page, f.user.email);
    const responses = await Promise.all(['Současný byt A', 'Současný byt B'].map(label => api(page).post(`/api/properties/${f.property.id}/units`, { multipart: { ownerId: f.owner.id, label }, maxRedirects: 0 })));
    expect(responses.every(response => response.status() === 303)).toBe(true);
    expect(responses.filter(response => response.headers().location.includes('ok='))).toHaveLength(1);
    expect(responses.filter(response => response.headers().location.includes('error='))).toHaveLength(1);
    expect(await db.unit.count({ where: { propertyId: f.property.id } })).toBe(3);
  } finally { await f.cleanup(); }
});

test('over-capacity Free can recover by archiving without deleting the unit or its data', async ({ page }) => {
  const f = await fixture('FREE', 4);
  try {
    await login(page, f.user.email);
    await page.goto('/ucet/predplatne');
    await expect(page.locator(`#${f.account.id}`)).toContainText('více jednotek');
    const recovery = await api(page).post('/api/subscriptions/archive', { data: { accountId: f.account.id, entityType: 'unit', entityId: f.units[3].id, confirmArchive: true } });
    expect(recovery.status()).toBe(200);
    const result = (await recovery.json()).result;
    expect(result.usage.units).toBe(3);
    expect(result.writable).toBe(true);
    expect(result.overCapacity).toBe(false);
    const preserved = await db.unit.findUniqueOrThrow({ where: { id: f.units[3].id } });
    expect(preserved.status).toBe(f.units[3].status);
    expect(preserved.operationalStatus).toBe('INACTIVE');
    expect(preserved.label).toBe(f.units[3].label);
    expect(await db.unit.count({ where: { propertyId: f.property.id } })).toBe(4);
    const restorePath = `/api/properties/${f.property.id}/units/${f.units[3].id}`;
    const overLimit = await api(page).post(restorePath, { multipart: { label: f.units[3].label, operationalStatus: 'STANDARD' }, maxRedirects: 0 });
    expect(overLimit.headers().location).toContain('error=');
    expect((await db.unit.findUniqueOrThrow({ where: { id: f.units[3].id } })).operationalStatus).toBe('INACTIVE');
    const freeSlot = await api(page).post(`/api/properties/${f.property.id}/units/${f.units[2].id}`, { multipart: { label: f.units[2].label, operationalStatus: 'INACTIVE' }, maxRedirects: 0 });
    expect(freeSlot.headers().location).toContain('ok=');
    const restored = await api(page).post(restorePath, { multipart: { label: f.units[3].label, operationalStatus: 'STANDARD' }, maxRedirects: 0 });
    expect(restored.headers().location).toContain('ok=');
    expect((await db.unit.findUniqueOrThrow({ where: { id: f.units[3].id } })).operationalStatus).toBe('STANDARD');
    const manual = await api(page).post('/api/payments/manual', { multipart: { leaseId: f.lease.id, idempotencyKey: randomUUID(), amount: '100', bookedAt: '2026-10-10' }, maxRedirects: 0 });
    expect(manual.headers().location).toContain('ok=');
  } finally { await f.cleanup(); }
});

test('after seven full days only the expired portfolio freezes; verified payment recovers it exactly once', async ({ page }, info) => {
  test.setTimeout(120000);
  const f = await fixture('PROFI', 1);
  try {
    await db.subscriptionAccount.update({ where: { id: f.account.id }, data: { paidUntil: new Date('2026-10-01'), simulationNow: new Date('2026-10-07') } });
    const otherProperty = await db.property.create({ data: { name: 'Druhé řádně hrazené portfolio', address: 'Testovací 24', city: 'Praha', ownerId: f.owner.id, memberships: { create: { userId: f.user.id, permission: 'ADMIN' } } } });
    const unit = await db.unit.create({ data: { propertyId: otherProperty.id, label: 'Samostatný placený byt', ownerships: { create: { ownerId: f.owner.id, shareBasisPoints: 10000 } } } });
    const lease = await db.lease.create({ data: { unitId: unit.id, tenantId: f.tenant.id, startDate: new Date('2025-01-01'), financialTrackingFromPeriod: '2025-01', rentCents: 1000000, servicesCents: 0, variableSymbol: String(Date.now() + 1).slice(-9) } });
    await db.charge.create({ data: { leaseId: lease.id, period: '2026-10', dueDate: new Date('2026-10-05'), amountCents: 1000000 } });
    await db.subscriptionAccount.create({ data: { payerUserId: f.user.id, ownerId: f.owner.id, kind: 'CLIENT', billingName: otherProperty.name, billingEmail: f.user.email, plan: 'PROFI', contract: makeContract(freshDefaultConfig(), 'PROFI', 10) as unknown as Prisma.InputJsonObject, paidUntil: new Date('2030-01-01'), scopes: { create: { propertyId: otherProperty.id, scopeKey: `P:${otherProperty.id}` } } } });
    await login(page, f.user.email);
    await page.goto('/ucet/predplatne');
    await expect(page.locator(`#${f.account.id}`)).toContainText('Po splatnosti');
    const grace = await api(page).post('/api/payments/manual', { multipart: { leaseId: f.lease.id, idempotencyKey: randomUUID(), amount: '100', bookedAt: '2026-10-07' }, maxRedirects: 0 });
    expect(grace.headers().location).toContain('ok=');
    await db.subscriptionAccount.update({ where: { id: f.account.id }, data: { simulationNow: new Date('2026-10-08') } });
    await page.reload();
    await expect(page.locator(`#${f.account.id}`)).toContainText('Pouze čtení');
    await shot(page, info, 'frozen-portfolio-desktop');
    const frozen = await api(page).post(`/api/payments/manual?propertyId=${otherProperty.id}`, { multipart: { leaseId: f.lease.id, propertyId: otherProperty.id, properties: otherProperty.id, idempotencyKey: randomUUID(), amount: '100', bookedAt: '2026-10-08' }, maxRedirects: 0 });
    expect(frozen.headers().location).toContain('error=');
    expect(await db.bankTransaction.count({ where: { suggestedLeaseId: f.lease.id } })).toBe(1);
    const paidOther = await api(page).post('/api/payments/manual', { multipart: { leaseId: lease.id, idempotencyKey: randomUUID(), amount: '100', bookedAt: '2026-10-08' }, maxRedirects: 0 });
    expect(paidOther.headers().location).toContain('ok=');
    const archive = await api(page).get(`/api/leases/${f.lease.id}/receipts/${f.receipt.id}`);
    expect(archive.status()).toBe(200);
    const frozenExport = await api(page).get(`/api/subscriptions/export?accountId=${f.account.id}`);
    expect(frozenExport.status()).toBe(200);
    const data = await frozenExport.json();
    expect(data.properties.map((row: { id: string }) => row.id)).toEqual([f.property.id]);
    expect(data.units.map((row: { id: string }) => row.id)).toEqual([f.units[0].id]);
    expect(data.leases.map((row: { id: string }) => row.id)).not.toContain(lease.id);
    const pending = await api(page).post('/api/subscriptions/request', { data: { accountId: f.account.id, method: 'APPLE_PAY', plan: 'PROFI', interval: 'MONTHLY', capacityUnits: 10 } });
    expect(pending.status()).toBe(200);
    const request = (await pending.json()).result;
    expect(request.amountCents).toBe(24900);
    expect((await db.subscriptionAccount.findUniqueOrThrow({ where: { id: f.account.id } })).paidUntil?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect((await api(page).post('/api/admin/subscriptions/clock', { data: { accountId: f.account.id, date: '2026-10-01' } })).status()).toBe(403);
    expect((await api(page).post('/api/subscriptions/recurring', { data: { accountId: f.account.id, consent: true } })).status()).toBe(200);
    expect((await db.subscriptionAccount.findUniqueOrThrow({ where: { id: f.account.id } })).recurringConsent).toBe(true);
    expect((await api(page).post('/api/subscriptions/recurring', { data: { accountId: f.account.id, consent: false } })).status()).toBe(200);
    expect((await db.subscriptionAccount.findUniqueOrThrow({ where: { id: f.account.id } })).recurringConsent).toBe(false);
    expect(await db.subscriptionPaymentRequest.count({ where: { accountId: f.account.id } })).toBe(1);
    expect((await api(page).post('/api/subscriptions/simulate', { data: { requestId: request.id, outcome: 'paid' } })).status()).toBe(403);
    await api(page).post('/api/auth/logout');
    await login(page, adminEmail, adminPassword);
    const clock = await api(page).post('/api/admin/subscriptions/clock', { data: { accountId: f.account.id, date: '2026-10-08' } });
    expect(clock.status()).toBe(200);
    expect((await clock.json()).result.status).toBe('FROZEN');
    const body = { requestId: request.id, outcome: 'paid', providerEventId: `qa-${randomUUID()}` };
    const failed = await api(page).post('/api/subscriptions/simulate', { data: { ...body, outcome: 'failed', providerEventId: `${body.providerEventId}-failed` } });
    expect(failed.status()).toBe(200);
    const failedResult = (await failed.json()).result;
    expect(failedResult.activated).toBe(false);
    expect(failedResult.review).toBe(true);
    expect((await db.subscriptionAccount.findUniqueOrThrow({ where: { id: f.account.id } })).paidUntil?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    const confirmed = await api(page).post('/api/subscriptions/simulate', { data: body });
    expect(confirmed.status()).toBe(200);
    expect((await confirmed.json()).result.activated).toBe(true);
    const recovered = await db.subscriptionAccount.findUniqueOrThrow({ where: { id: f.account.id } });
    expect(recovered.paidUntil?.toISOString()).toBe('2026-11-08T00:00:00.000Z');
    const duplicate = await api(page).post('/api/subscriptions/simulate', { data: body });
    expect((await duplicate.json()).result.duplicate).toBe(true);
    expect((await db.subscriptionAccount.findUniqueOrThrow({ where: { id: f.account.id } })).paidUntil).toEqual(recovered.paidUntil);
    expect(await db.subscriptionPaymentEvent.count({ where: { requestId: request.id } })).toBe(2);
    await api(page).post('/api/auth/logout');
    await login(page, f.user.email);
    await page.goto('/ucet/predplatne');
    await expect(page.locator(`#${f.account.id}`)).toContainText('Zaplaceno');
    await page.setViewportSize({ width: 390, height: 844 });
    await shot(page, info, 'recovered-portfolio-mobile');
  } finally { await f.cleanup(); }
});

test('tenant portal retains reading and defect reports while Free and frozen accounts cannot issue new receipts', async ({ page }, info) => {
  test.setTimeout(90000);
  const f = await fixture();
  const tenantUser = await db.user.create({ data: { name: f.tenant.name, email: f.tenant.email!, passwordHash: await bcrypt.hash(password, 8), role: 'TENANT', isTestIdentity: true } });
  await db.tenantPortalAccess.create({ data: { tenantId: f.tenant.id, userId: tenantUser.id } });
  const bank = await db.bankAccount.create({ data: { propertyId: f.property.id, ownerId: f.owner.id, provider: 'qa', bankName: 'QA banka', ibanMasked: 'QA', externalAccountId: randomUUID() } });
  await db.bankTransaction.create({ data: { bankAccountId: bank.id, externalId: randomUUID(), bookedAt: new Date('2026-10-05'), amountCents: f.charge.amountCents, status: 'MATCHED', allocations: { create: { chargeId: f.charge.id, amountCents: f.charge.amountCents } } } });
  try {
    await page.goto('/login');
    await page.getByLabel('E-mail', { exact: true }).fill(tenantUser.email);
    await page.getByLabel('Heslo', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Přihlásit se', exact: true }).click();
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto(`/portal/najemnik/${f.tenant.id}`);
    await expect(page.locator('main')).toContainText(f.property.name);
    const denied = await api(page).post(`/api/portal/tenants/${f.tenant.id}/receipts`, { form: { chargeId: f.charge.id }, maxRedirects: 0 });
    expect(denied.status()).toBe(403);
    expect((await denied.json()).code).toBe('SUBSCRIPTION_FEATURE');
    const nativeDenied = await api(page).post(`/api/portal/tenants/${f.tenant.id}/receipts`, { multipart: { chargeId: f.charge.id }, maxRedirects: 0 });
    expect(nativeDenied.status()).toBe(303);
    expect(decodeURIComponent(nativeDenied.headers().location)).toMatch(/error=.*(?:tarif|doklad|předplat)/i);
    expect(await db.tenantPaymentReceipt.count({ where: { chargeId: f.charge.id } })).toBe(1);
    expect((await api(page).get(`/api/subscriptions/export?accountId=${f.account.id}`)).status()).toBe(403);
    const archived = await api(page).get(`/api/portal/tenants/${f.tenant.id}/receipts/${f.receipt.id}`);
    expect(archived.status()).toBe(200);
    expect(await archived.body()).toEqual(pdf);
    await db.subscriptionAccount.update({ where: { id: f.account.id }, data: { plan: 'PROFI', contract: makeContract(freshDefaultConfig(), 'PROFI', 10) as unknown as Prisma.InputJsonObject, paidUntil: new Date('2026-10-01'), simulationNow: new Date('2026-10-08') } });
    await page.reload();
    await expect(page.locator('main')).toContainText(f.property.name);
    const ordinary = await api(page).post(`/api/portal/tenants/${f.tenant.id}/defects`, { multipart: { leaseId: f.lease.id, title: 'Běžná drobná závada', description: 'Při zmrazení se běžná nová práce nepovoluje.', submissionKey: randomUUID() }, maxRedirects: 0 });
    expect(ordinary.status()).toBe(303);
    expect(ordinary.headers().location).toContain('error=');
    const defect = await api(page).post(`/api/portal/tenants/${f.tenant.id}/defects`, { multipart: { leaseId: f.lease.id, title: 'Havarijní únik vody', description: 'V koupelně uniká voda z přívodu. Prosím o opravu.', urgent: 'yes', submissionKey: randomUUID() }, maxRedirects: 0 });
    expect(defect.status()).toBe(303);
    expect(defect.headers().location).toContain('ok=');
    expect(await db.task.count({ where: { propertyId: f.property.id, tenantPortalRequestKind: 'DEFECT' } })).toBe(1);
    expect((await api(page).get(`/api/portal/tenants/${f.tenant.id}/receipts/${f.receipt.id}`)).status()).toBe(200);
    await page.setViewportSize({ width: 390, height: 844 });
    await shot(page, info, 'tenant-frozen-portal-mobile');
  } finally {
    await db.taskNotification.deleteMany({ where: { task: { propertyId: f.property.id } } });
    await db.auditLog.deleteMany({ where: { userId: tenantUser.id } });
    await db.tenantPortalAccess.deleteMany({ where: { userId: tenantUser.id } });
    await f.cleanup();
    await db.user.delete({ where: { id: tenantUser.id } });
  }
});

test('gift expiry falls back to Free without debt and internal team exemption has no paid renewal', async ({ page }, info) => {
  test.setTimeout(90000);
  const f = await fixture('PROFI', 1);
  try {
    await db.subscriptionAccount.update({ where: { id: f.account.id }, data: { offerKind: 'FREE_UNTIL', offerUntil: new Date('2026-10-12'), simulationNow: new Date('2026-10-11') } });
    await login(page, f.user.email);
    await page.goto('/ucet/predplatne');
    await expect(page.locator(`#${f.account.id}`)).toContainText('Zdarma do');
    await db.subscriptionAccount.update({ where: { id: f.account.id }, data: { simulationNow: new Date('2026-10-12') } });
    await page.reload();
    await expect(page.locator(`#${f.account.id}`)).toContainText('Zdarma');
    expect(await db.subscriptionPaymentRequest.count({ where: { accountId: f.account.id } })).toBe(0);
    expect(await db.unit.count({ where: { propertyId: f.property.id } })).toBe(1);
    expect((await api(page).post(`/api/leases/${f.lease.id}/contract-preview`, { multipart: {}, maxRedirects: 0 })).status()).toBe(403);
    await db.user.update({ where: { id: f.user.id }, data: { flatcloudMember: true } });
    await db.subscriptionAccount.update({ where: { id: f.account.id }, data: { offerKind: 'NONE', offerUntil: null } });
    await page.reload();
    await expect(page.locator(`#${f.account.id}`)).toContainText('FlatCloud team');
    await expect(page.locator(`#${f.account.id}`)).toContainText('Bez úhrady');
    const noPayment = await api(page).post('/api/subscriptions/request', { data: { accountId: f.account.id, method: 'GOOGLE_PAY' } });
    expect(noPayment.status()).toBe(400);
    expect(await db.subscriptionPaymentRequest.count({ where: { accountId: f.account.id } })).toBe(0);
    await shot(page, info, 'team-exempt-subscription');
  } finally { await f.cleanup(); }
});

test('payment during a gifted period starts the paid period after the promised benefit', async ({ page }) => {
  const f = await fixture('PROFI', 1);
  try {
    await db.subscriptionAccount.update({ where: { id: f.account.id }, data: { offerKind: 'FREE_UNTIL', offerUntil: new Date('2026-10-12'), simulationNow: new Date('2026-10-11') } });
    await login(page, f.user.email);
    const payment = await api(page).post('/api/subscriptions/request', { data: { accountId: f.account.id, method: 'CARD', plan: 'PROFI', interval: 'MONTHLY', capacityUnits: 10 } });
    expect(payment.status()).toBe(200);
    const request = (await payment.json()).result;
    expect(request.amountCents).toBe(24900);
    await api(page).post('/api/auth/logout');
    await login(page, adminEmail, adminPassword);
    const verified = await api(page).post('/api/subscriptions/simulate', { data: { requestId: request.id, outcome: 'paid' } });
    expect(verified.status()).toBe(200);
    expect((await verified.json()).result.activated).toBe(true);
    expect((await db.subscriptionAccount.findUniqueOrThrow({ where: { id: f.account.id } })).paidUntil?.toISOString()).toBe('2026-11-12T00:00:00.000Z');
  } finally { await f.cleanup(); }
});

test('bank verification rejects partial, unrelated-account and wrong-reference receipts before activation', async () => {
  const f = await fixture('PROFI', 1);
  try {
    const { createPaymentRequest, verifySimulatedPayment } = await import('../lib/subscriptions/service');
    const admin = await db.user.findUniqueOrThrow({ where: { email: adminEmail } });
    await db.subscriptionAccount.update({ where: { id: f.account.id }, data: { simulationNow: new Date('2026-10-10') } });
    const request = await createPaymentRequest(f.account.id, 'BANK', f.user.id);
    const input = { requestId: request.id, providerEventId: randomUUID(), amountCents: request.amountCents, currency: request.currency, recipientAccount: request.recipientAccount, reference: request.reference, paymentStatus: 'PAID' };
    for (const invalid of [
      { amountCents: request.amountCents - 100 },
      { recipientAccount: 'UNRELATED-RENT-ACCOUNT' },
      { reference: 'WRONG-REFERENCE' },
      { currency: 'EUR' },
    ]) {
      const result = await verifySimulatedPayment({ ...input, ...invalid, providerEventId: randomUUID() }, admin.id);
      expect(result.activated).toBe(false);
      expect(result.review).toBe(true);
      expect((await db.subscriptionAccount.findUniqueOrThrow({ where: { id: f.account.id } })).paidUntil).toBeNull();
    }
    const accepted = await verifySimulatedPayment(input, admin.id);
    expect(accepted.activated).toBe(true);
    const duplicate = await verifySimulatedPayment(input, admin.id);
    expect(duplicate.duplicate).toBe(true);
    expect((await db.subscriptionAccount.findUniqueOrThrow({ where: { id: f.account.id } })).paidUntil?.toISOString()).toBe('2026-11-10T00:00:00.000Z');
    expect(await db.subscriptionPaymentEvent.count({ where: { requestId: request.id } })).toBe(5);
  } finally { await f.cleanup(); }
});
