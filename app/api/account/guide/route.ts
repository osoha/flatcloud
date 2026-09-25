import { NextResponse } from "next/server";
import { guideOriginMatches } from "@/lib/guide-origin";
import { currentUser, canSeeAll, hasAllPropertyAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GUIDE_VERSION, guideTransition, normalizeGuideState, type GuideAction } from "@/lib/first-login-guide";
import { displayMode, displayModeCookie } from "@/lib/display-mode";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
const select = { onboardingStatus: true, onboardingStep: true, onboardingVersion: true, onboardingRevision: true } as const;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET() {
  const user = await currentUser();
  if (!user) return json({ error: "Přihlaste se prosím znovu." }, 401);
  const [mode, cookieStore] = await Promise.all([displayMode(user.id, user.onboardingStatus === "pending" ? "basic" : "pro"), cookies()]);
  const full = hasAllPropertyAccess(user);
  const [row, property, edits] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select }),
    prisma.property.findFirst({ where: { active: true, ...(full ? {} : { OR: [{ memberships: { some: { userId: user.id } } }, { units: { some: { userAccesses: { some: { userId: user.id } } } } }] }) }, select: { id: true } }),
    full ? Promise.resolve(1) : prisma.userProperty.count({ where: { userId: user.id, permission: { in: ["EDIT", "ADMIN"] } } }),
  ]);
  return json({ state: normalizeGuideState(row, mode), mode, modeChosen: Boolean(cookieStore.get(displayModeCookie(user.id))), capabilities: { hasProperties: Boolean(property), canAddTask: full || edits > 0,
    canAddProperty: canSeeAll(user.role) || (process.env.PUBLIC_REGISTRATION_ENABLED === "true" && user.role === "OWNER_VIEWER") } });
}

export async function POST(request: Request) {
  // JSON-only plus Origin check prevents cross-site form writes to personal progress.
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Neplatný požadavek." }, 415);
  if (!guideOriginMatches(request)) return json({ error: "Neplatný původ požadavku." }, 403);
  const user = await currentUser();
  if (!user) return json({ error: "Přihlaste se prosím znovu." }, 401);
  const mode = await displayMode(user.id, user.onboardingStatus === "pending" ? "basic" : "pro");
  let body: { action?: GuideAction; revision?: number; version?: number };
  try { body = await request.json(); } catch { return json({ error: "Neplatný požadavek." }, 400); }
  if (!body || !["start", "resume", "next", "back", "pause", "dismiss"].includes(body.action || "") || !Number.isSafeInteger(body.revision) || body.version !== GUIDE_VERSION) return json({ error: "Neplatný krok průvodce." }, 400);
  const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select });
  const state = normalizeGuideState(row, mode);
  if (state.revision !== body.revision) return json({ error: "Průvodce se změnil v jiném okně. Stav byl obnoven.", state }, 409);
  const next = guideTransition(state, body.action!, mode);
  if (!next) return json({ error: "Tento krok už není dostupný.", state }, 409);
  const saved = await prisma.user.updateMany({ where: { id: user.id, onboardingRevision: body.revision }, data: {
    onboardingStatus: next.status, onboardingStep: next.step, onboardingVersion: next.version, onboardingRevision: { increment: 1 },
  } });
  if (!saved.count) return json({ error: "Průvodce se změnil v jiném okně. Obnovte jej prosím." }, 409);
  return json({ state: { ...next, revision: state.revision + 1 } });
}
