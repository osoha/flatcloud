import { NextResponse } from "next/server";
import { actualUser, previewContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { goWithMessage } from "@/lib/route-response";
import { FEATURE_KEYS, PLAN_CODES, type BillingInterval, type FeatureKey, type Features, type OfferKind, type PaymentMethod, type PlanCode } from "@/lib/subscriptions/types";
import { subscriptionsSandboxEnabled } from "@/lib/subscriptions/service";

export const dynamic = "force-dynamic";

/** Every mutation has its own boundary, including when called outside the UI. */
export async function subscriptionActor(request: Request, adminOnly = false) {
  if (!(await subscriptionsSandboxEnabled())) return { response: new NextResponse("Not found", { status: 404 }) };
  const actor = await actualUser();
  if (!actor) return { response: NextResponse.json({ error: "Přihlášení vypršelo." }, { status: 401 }) };
  if (adminOnly && actor.role !== "SUPER_ADMIN") return { response: NextResponse.json({ error: "Přístup není povolen." }, { status: 403 }) };
  if (adminOnly || request.method !== "GET") {
    if ((await previewContext()).requested) return { response: NextResponse.json({ error: "Pohled uživatele je pouze pro čtení. Nejprve ukončete náhled." }, { status: 403 }) };
  }
  if (request.method !== "GET") {
    if (request.headers.get("sec-fetch-site") === "cross-site") return { response: NextResponse.json({ error: "Požadavek z jiného webu není povolen." }, { status: 403 }) };
    const origin = request.headers.get("origin");
    if (origin) {
      const allowed = new Set([new URL(request.url).origin]);
      if (process.env.APP_URL) { try { allowed.add(new URL(process.env.APP_URL).origin); } catch { /* malformed configuration grants no additional origin */ } }
      if (!allowed.has(origin)) return { response: NextResponse.json({ error: "Požadavek z jiného webu není povolen." }, { status: 403 }) };
    }
  }
  return { actor };
}

export async function subscriptionForm(request: Request): Promise<FormData> {
  if (request.headers.get("content-type")?.includes("application/json")) {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Neplatný požadavek.");
    const form = new FormData();
    for (const [key, value] of Object.entries(body)) {
      if (Array.isArray(value)) for (const item of value) form.append(key, String(item));
      else if (value !== null && value !== undefined) form.append(key, typeof value === "boolean" ? (value ? "on" : "") : String(value));
    }
    return form;
  }
  return request.formData();
}

export function textField(form: FormData, key: string, maximum = 200): string {
  const value = form.get(key);
  if (value === null) return "";
  if (typeof value !== "string" || value.length > maximum) throw new Error(`Neplatná hodnota: ${key}.`);
  return value.trim();
}
export function requiredField(form: FormData, key: string, maximum = 200): string {
  const value = textField(form, key, maximum);
  if (!value) throw new Error(`Vyplňte pole: ${key}.`);
  return value;
}
export function integerField(form: FormData, key: string, minimum = 0, maximum = 100_000): number {
  const raw = requiredField(form, key, 20);
  if (!/^\d+$/.test(raw)) throw new Error(`Neplatné celé číslo: ${key}.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`Neplatné celé číslo: ${key}.`);
  return value;
}
export function centsField(form: FormData, key: string): number {
  const raw = requiredField(form, key, 30).replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) throw new Error(`Neplatná cena: ${key}.`);
  const value = Math.round(Number(raw) * 100);
  if (!Number.isSafeInteger(value) || value > 100_000_000) throw new Error(`Neplatná cena: ${key}.`);
  return value;
}
export function checked(form: FormData, key: string): boolean { return ["on", "true", "1"].includes(textField(form, key, 10)); }
export function enumField<T extends string>(form: FormData, key: string, options: readonly T[], fallback?: T): T {
  const value = textField(form, key, 40) || fallback;
  if (!value || !options.includes(value as T)) throw new Error(`Neplatná volba: ${key}.`);
  return value as T;
}
export function planField(form: FormData, key = "plan"): PlanCode { return enumField(form, key, PLAN_CODES); }
export function intervalField(form: FormData): BillingInterval { return enumField(form, "interval", ["MONTHLY", "ANNUAL"] as const); }
export function methodField(form: FormData): PaymentMethod { return enumField(form, "method", ["CARD", "APPLE_PAY", "GOOGLE_PAY", "BANK"] as const); }
export function offerField(form: FormData): OfferKind { return enumField(form, "offerKind", ["NONE", "PERCENT", "FIXED", "FREE_UNTIL", "TEAM"] as const, "NONE"); }
export function dateField(form: FormData, key: string): string | null {
  const raw = textField(form, key, 10);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`Neplatné datum: ${key}.`);
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== raw) throw new Error(`Neplatné datum: ${key}.`);
  return date.toISOString();
}
export function stringList(form: FormData, key: string): string[] {
  const values = form.getAll(key);
  if (values.length > 1000 || values.some(value => typeof value !== "string" || value.length > 100)) throw new Error("Neplatný rozsah portfolia.");
  return [...new Set((values as string[]).map(value => value.trim()).filter(Boolean))];
}
export function featureOverrides(form: FormData): Partial<Features> {
  const result: Partial<Features> = {};
  for (const key of FEATURE_KEYS) {
    const value = enumField(form, `override:${key}`, ["inherit", "on", "off"] as const, "inherit");
    if (value !== "inherit") result[key as FeatureKey] = value === "on";
  }
  return result;
}
export function subscriptionSuccess(request: Request, path: string, message: string, result?: unknown) {
  if (request.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ ok: true, message, ...(result === undefined ? {} : { result }) }, { headers: { "Cache-Control": "no-store" } });
  return goWithMessage(request, path, "ok", message);
}
export function billingReturnPath(form: FormData, admin: boolean): string {
  const path = textField(form, "returnTo", 250);
  if (path === "/ucet/predplatne") return path;
  if (admin && /^\/uzivatele\/[a-zA-Z0-9_-]+#predplatne$/.test(path)) return path;
  return "/ucet/predplatne";
}
export async function subscriptionPayerBoundary(accountId: string, actor: { id: string; role: string }) {
  const account = await prisma.subscriptionAccount.findUnique({ where: { id: accountId }, select: { payerUserId: true } });
  if (!account) return NextResponse.json({ error: "Předplatné nebylo nalezeno." }, { status: 404 });
  if (actor.role !== "SUPER_ADMIN" && account.payerUserId !== actor.id) return NextResponse.json({ error: "K platebnímu účtu nemáte přístup." }, { status: 403 });
  return null;
}
export function subscriptionFailure(request: Request, path: string, error: unknown) {
  const message = error instanceof Error && !/prisma|database|sql|constraint|connect|password|credential/i.test(error.message) ? error.message.slice(0, 300) : "Nastavení se nepodařilo uložit. Zkuste to znovu.";
  if (request.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  return goWithMessage(request, path, "error", message);
}
