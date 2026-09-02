import { notFound } from "next/navigation";
import { requireUser, hasAllPropertyAccess } from "@/lib/auth";
import { requirePropertyAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PropertySubnav } from "@/components/PropertySubnav";
import { Flash } from "@/components/FormUi";
import { manualBaselineSnapshotDataSchema } from "@/lib/reporting/snapshot-schema";
import { resolvePropertyMfRentBenchmarks } from "@/lib/reporting/mf-rent/service";
import { searchMfRentTerritories } from "@/lib/reporting/mf-rent/location-service";

const czk = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  maximumFractionDigits: 2,
});
const number = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 });
function inputMoney(value: number | null | undefined) {
  return value == null ? "" : String(value / 100).replace(".", ",");
}
function inputPercent(value: number | null | undefined) {
  return value == null ? "" : String(value / 100).replace(".", ",");
}
export default async function PropertyReportingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    ok?: string;
    error?: string;
    edit?: string;
    mfSearch?: string;
  }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const property = await requirePropertyAccess(user, id);
  if (!property) notFound();
  const membership = property.memberships.find((row) => row.userId === user.id);
  if (!hasAllPropertyAccess(user) && !membership) notFound();
  const canWrite =
    hasAllPropertyAccess(user) ||
    membership?.permission === "EDIT" ||
    membership?.permission === "ADMIN";
  const snapshots = await prisma.quarterSnapshot.findMany({
    where: { propertyId: id, source: "MANUAL_BASELINE" },
    include: { createdBy: { select: { name: true } } },
    orderBy: [{ year: "desc" }, { quarter: "desc" }, { revision: "desc" }],
  });
  const latest = new Map<string, (typeof snapshots)[number]>();
  for (const row of snapshots) {
    const key = `${row.year}-${row.quarter}`;
    if (!latest.has(key)) latest.set(key, row);
  }
  const rows = [...latest.values()];
  const editing = query.edit ? latest.get(query.edit) : undefined;
  const editData = editing
    ? manualBaselineSnapshotDataSchema.safeParse(editing.data)
    : null;
  const d = editData?.success ? editData.data : null;
  const explicit =
    d?.source === "MANUAL_BASELINE" && d.schemaVersion === 2
      ? d.units?.occupancyBps
      : undefined;
  const derived =
    explicit ??
    (typeof d?.units?.occupied === "number" &&
    typeof d.units.rentable === "number" &&
    d.units.rentable > 0
      ? Math.round((d.units.occupied / d.units.rentable) * 10000)
      : undefined);
  const now = new Date();
  const mf = await resolvePropertyMfRentBenchmarks({
    propertyId: id,
    targetYear: now.getUTCFullYear(),
    targetQuarter: Math.floor(now.getUTCMonth() / 3) + 1,
    cutoff: now,
  });
  const mfCandidates = query.mfSearch
    ? await searchMfRentTerritories(query.mfSearch, property.city, 25)
    : [];
  const mfMoney = (value: number | null | undefined) =>
    value == null ? "—" : `${number.format(value / 100)} Kč/m²/měsíc`;
  return (
    <Shell user={user}>
      <div className="page">
        <div className="breadcrumb">Portfolio › {property.name} › Reporty</div>
        <div className="page-title">
          <div>
            <h1>Reporty</h1>
            <p>{property.name}</p>
          </div>
        </div>
        <PropertySubnav propertyId={id} active="reporting" />
        <Flash ok={query.ok} error={query.error} />
        <div className="card">
          <h2>Cenová mapa nájemného MF</h2>
          {mf.mapping ? (
            <div className="summary-list">
              <div>
                <span>Katastrální území</span>
                <strong>{mf.mapping.territoryName}</strong>
              </div>
              <div>
                <span>Kód</span>
                <strong>{mf.mapping.territoryCode}</strong>
              </div>
              <div>
                <span>Zdroj přiřazení</span>
                <strong>
                  {mf.locationSource === "PROPERTY_CADASTRAL_DATA"
                    ? "Údaje nemovitosti"
                    : "Ruční korekce"}
                </strong>
              </div>
              <div>
                <span>Datové období MF</span>
                <strong>
                  {mf.release
                    ? `Q${mf.release.marketQuarter} ${mf.release.marketYear}`
                    : "—"}
                </strong>
              </div>
              <div>
                <span>Publikováno</span>
                <strong>
                  {mf.release?.publishedOn.toLocaleDateString("cs-CZ") || "—"}
                </strong>
              </div>
            </div>
          ) : (
            <p>Nemovitost zatím není přiřazena ke katastrálnímu území MF.</p>
          )}
          {mf.release && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Kategorie</th>
                    <th>Referenční nájem</th>
                    <th>Novostavba</th>
                  </tr>
                </thead>
                <tbody>
                  {(["vk1", "vk2", "vk3", "vk4"] as const).map((key) => (
                    <tr key={key}>
                      <td>{key.toUpperCase()}</td>
                      <td>{mfMoney(mf[key]?.referenceRentCentsPerM2)}</td>
                      <td>
                        {mfMoney(mf[key]?.newBuildReferenceRentCentsPerM2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {canWrite && (
            <details className="create-panel" open={!mf.mapping || Boolean(query.mfSearch)}>
              <summary>Ruční korekce přiřazení MF</summary>
              {mf.cadastralArea && !mf.mapping && (
                <p className="muted-copy">
                  Katastrální území „{mf.cadastralArea}“ z údajů nemovitosti
                  nebylo možné jednoznačně spojit s aktuálními daty MF. Vyberte
                  ruční korekci níže.
                </p>
              )}
              <form method="get" className="compact-form">
                <label className="field">
                  <span>Hledat území, obec nebo kód</span>
                  <input name="mfSearch" defaultValue={query.mfSearch || ""} />
                </label>
                <button className="secondary" type="submit">
                  Vyhledat
                </button>
              </form>
              {mfCandidates.map((candidate) => (
                <form
                  key={candidate.territoryCode}
                  action={`/api/properties/${id}/mf-rent/location`}
                  method="post"
                  className="stack-actions"
                >
                  <input
                    type="hidden"
                    name="territoryCode"
                    value={candidate.territoryCode}
                  />
                  <span>
                    {candidate.territoryName} · {candidate.municipalityName} ·{" "}
                    {candidate.territoryCode}
                  </span>
                  <button className="secondary" type="submit">
                    Přiřadit k nemovitosti
                  </button>
                </form>
              ))}
            </details>
          )}
        </div>
        <div className="card">
          <h2>Historická kvartální data</h2>
          <p className="muted-copy">
            Ruční historická data slouží pro období před plným provozem
            FlatCloudu. Prázdné hodnoty zůstávají neznámé. Uložení vytváří novou
            neměnnou revizi.
          </p>
          {canWrite && (
            <form
              className="compact-form"
              action={`/api/properties/${id}/reporting/historical-quarter`}
              method="post"
            >
              <label className="field">
                <span>Rok</span>
                <input
                  name="year"
                  type="number"
                  min="1900"
                  max="2200"
                  required
                  defaultValue={editing?.year}
                />
              </label>
              <label className="field">
                <span>Čtvrtletí</span>
                <select
                  name="quarter"
                  required
                  defaultValue={editing?.quarter || 1}
                >
                  {[1, 2, 3, 4].map((q) => (
                    <option key={q} value={q}>
                      Q{q}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Obsazenost (%)</span>
                <input
                  name="occupancyPercent"
                  inputMode="decimal"
                  defaultValue={inputPercent(derived)}
                />
              </label>
              <label className="field">
                <span>Měsíční čisté nájemné (Kč)</span>
                <input
                  name="monthlyNetRentCzk"
                  inputMode="decimal"
                  defaultValue={inputMoney(d?.rentRoll?.monthlyNetRentCents)}
                />
              </label>
              <label className="field">
                <span>Čisté nájemné / m² / měsíc (Kč)</span>
                <input
                  name="weightedNetRentPerM2Czk"
                  inputMode="decimal"
                  defaultValue={inputMoney(
                    d?.rentRoll?.weightedNetRentPerM2Cents,
                  )}
                />
              </label>
              <label className="field">
                <span>Úspěšnost inkasa (%)</span>
                <input
                  name="collectionRatePercent"
                  inputMode="decimal"
                  defaultValue={inputPercent(d?.collections?.collectionRateBps)}
                />
              </label>
              <label className="field">
                <span>Dluh po splatnosti (Kč)</span>
                <input
                  name="overdueDebtCzk"
                  inputMode="decimal"
                  defaultValue={inputMoney(d?.collections?.overdueDebtCents)}
                />
              </label>
              <label className="field field-full">
                <span>Zdroj / poznámka</span>
                <input
                  name="sourceNote"
                  maxLength={500}
                  required
                  defaultValue={editing?.sourceNote || ""}
                />
              </label>
              <button className="primary" type="submit">
                {editing ? "Uložit novou revizi" : "Uložit období"}
              </button>
            </form>
          )}
        </div>
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Období</th>
                  <th>Obsazenost</th>
                  <th>Čisté nájemné / měsíc</th>
                  <th>Čisté nájemné / m²</th>
                  <th>Inkaso</th>
                  <th>Dluh po splatnosti</th>
                  <th>Zdroj</th>
                  <th>Revize</th>
                  <th>Uložil / datum</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((row) => {
                    const parsed = manualBaselineSnapshotDataSchema.safeParse(
                      row.data,
                    );
                    const data = parsed.success ? parsed.data : null;
                    const occupancy =
                      data?.schemaVersion === 2 &&
                      data.units?.occupancyBps !== undefined
                        ? data.units.occupancyBps
                        : typeof data?.units?.occupied === "number" &&
                            typeof data.units.rentable === "number" &&
                            data.units.rentable > 0
                          ? (data.units.occupied / data.units.rentable) * 10000
                          : null;
                    return (
                      <tr key={row.id}>
                        <td>
                          Q{row.quarter} {row.year}
                        </td>
                        <td>
                          {occupancy == null
                            ? "—"
                            : `${number.format(occupancy / 100)} %`}
                        </td>
                        <td>
                          {data?.rentRoll?.monthlyNetRentCents == null
                            ? "—"
                            : czk.format(
                                data.rentRoll.monthlyNetRentCents / 100,
                              )}
                        </td>
                        <td>
                          {data?.rentRoll?.weightedNetRentPerM2Cents == null
                            ? "—"
                            : `${czk.format(data.rentRoll.weightedNetRentPerM2Cents / 100)}/m²`}
                        </td>
                        <td>
                          {data?.collections?.collectionRateBps == null
                            ? "—"
                            : `${number.format(data.collections.collectionRateBps / 100)} %`}
                        </td>
                        <td>
                          {data?.collections?.overdueDebtCents == null
                            ? "—"
                            : czk.format(
                                data.collections.overdueDebtCents / 100,
                              )}
                        </td>
                        <td>{row.sourceNote || "—"}</td>
                        <td>r{row.revision}</td>
                        <td>
                          {row.createdBy?.name || "—"} ·{" "}
                          {row.createdAt.toLocaleDateString("cs-CZ")}
                        </td>
                        <td>
                          {canWrite && (
                            <a
                              href={`/nemovitosti/${id}/reporting?edit=${row.year}-${row.quarter}`}
                            >
                              Nová revize
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={10}>Zatím bez historických dat.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Shell>
  );
}
