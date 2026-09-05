import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Building2,
  CircleDollarSign,
  ClipboardCheck,
  Home,
  Wrench,
} from "lucide-react";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { canSeeAll, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { date, money } from "@/lib/format";
import { dateInput, moneyInput } from "@/lib/forms";
import {
  unitInvestmentUrgencies,
  unitQualityRatings,
} from "@/lib/distribution/unit-assessments";
import { currentLeaseForUnit } from "@/lib/lease-lifecycle-core";
import { unitValuationSources } from "@/lib/distribution/unit-valuations";

export const dynamic = "force-dynamic";
export default async function DistributionPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const [user, query] = await Promise.all([requireUser(), searchParams]);
  if (!canSeeAll(user.role)) redirect("/portfolio");
  const properties = await prisma.property.findMany({
    where: { active: true, flatcloudConsolidationBasisPoints: { gt: 0 } },
    select: {
      id: true,
      name: true,
      address: true,
      units: {
        select: {
          id: true,
          label: true,
          areaM2: true,
          status: true,
          leases: {
            select: {
              startDate: true,
              endDate: true,
              terminatedOn: true,
              cancelledAt: true,
              tenant: { select: { name: true } },
            },
          },
          assetAssessments: {
            orderBy: [{ assessedAt: "desc" }, { createdAt: "desc" }],
                take: 2,
            include: { createdBy: { select: { name: true } } },
          },
          valuationSnapshots: {
            orderBy: [{ valuationDate: "desc" }, { createdAt: "desc" }],
                take: 2,
            include: { createdBy: { select: { name: true } } },
          },
        },
        orderBy: { label: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });
  const units = properties.flatMap((property) =>
      property.units.map((unit) => ({ property, ...unit })),
    ),
    latest = units.map((unit) => unit.assetAssessments[0]).filter(Boolean),
    valuations = units
      .map((unit) => unit.valuationSnapshots[0])
      .filter(Boolean),
    capex = latest.reduce((sum, row) => sum + row.estimatedCapexCents, 0),
    marketValue = valuations.reduce(
      (sum, row) => sum + Number(row.marketValueCents),
      0,
    ),
    ready = latest.filter((row) => row.distributionReady).length,
    urgent = latest.filter(
      (row) => row.investmentUrgency === "IMMEDIATE",
    ).length;
  return (
    <Shell user={user}>
      <div className="page distribution-page">
        <div className="page-title">
          <div>
            <h1>Kategorizace a distribuce</h1>
            <p>
              Interní příprava jednotek potvrzených aktiv FlatCloud. Externí a
              nezařazené nemovitosti jsou záměrně vyloučené.
            </p>
            <span className="scope-context-badge">
              Interní modul · pouze FlatCloud Group
            </span>
          </div>
          <div className="action-row">
            <Link className="secondary" href="/distribuce/reporting">
              Podklady pro akcionáře
            </Link>
            <Link className="primary" href="/distribuce/zajemci">
              CRM zájemců
            </Link>
          </div>
        </div>
        <Flash ok={query.ok} error={query.error} />
        <div className="stat-grid v21-stat-grid distribution-kpis">
          <Stat
            label="Jednotky ve scope"
            value={String(units.length)}
            icon={<Home />}
          />
          <Stat
            label="Ohodnoceno / valuováno"
            value={`${latest.length}/${valuations.length}`}
            icon={<ClipboardCheck />}
          />
          <Stat
            label="Odhad CAPEX"
            value={money(capex)}
            icon={<CircleDollarSign />}
          />
          <Stat
            label="Tržní hodnota jednotek"
            value={money(marketValue)}
            icon={<Building2 />}
          />
          <Stat
            label="Připraveno / urgentní"
            value={`${ready} / ${urgent}`}
            icon={<Wrench />}
          />
        </div>
        <div className="notice">
          <strong>Rating a valuace jsou dva různé podklady</strong>
          <span>
            Fyzický stav, odhad CAPEX a tržní hodnota mají vlastní neměnnou
            historii. Příznak „připraveno pro distribuci“ pouze potvrzuje
            interní připravenost; nezveřejňuje nabídku.
          </span>
        </div>
        <section className="card portfolio-table-card">
          <div className="table-toolbar">
            <div>
              <h2>Jednotky FlatCloud</h2>
              <p>
                Technický rating a valuace se aktualizují samostatnými
                snapshoty. CRM zájemců naváže v dalším řezu.
              </p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nemovitost / jednotka</th>
                  <th>Nájemní stav</th>
                  <th>Rating</th>
                  <th>Investice</th>
                  <th>Odhad CAPEX</th>
                  <th>Tržní hodnota</th>
                  <th>Distribuce</th>
                  <th>Hodnoceno</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {units.length ? (
                  units.map((unit) => {
                    const assessment = unit.assetAssessments[0],
                      valuation = unit.valuationSnapshots[0],
                      activeLease = currentLeaseForUnit(unit.leases);
                    return (
                      <tr key={unit.id}>
                        <td>
                          <Link
                            className="entity-link"
                            href={`/nemovitosti/${unit.property.id}/jednotky/${unit.id}`}
                          >
                            {unit.property.name} · {unit.label}
                          </Link>
                          <span className="owner-sub">
                            {unit.areaM2
                              ? `${unit.areaM2.toLocaleString("cs-CZ")} m²`
                              : "Plocha chybí"}
                          </span>
                        </td>
                        <td>{activeLease?.tenant.name || "Volná jednotka"}</td>
                        <td>
                          {assessment ? (
                            <span
                              className={`rating-badge rating-${assessment.rating.slice(0, 1).toLowerCase()}`}
                            >
                              {unitQualityRatings[assessment.rating]}
                            </span>
                          ) : (
                            <span className="status warn">Nehodnoceno</span>
                          )}
                        </td>
                        <td>
                          {assessment
                            ? unitInvestmentUrgencies[
                                assessment.investmentUrgency
                              ]
                            : "—"}
                        </td>
                        <td>
                          {assessment
                            ? money(assessment.estimatedCapexCents)
                            : "—"}
                        </td>
                        <td>
                          {valuation ? (
                            <>
                              <strong>
                                {money(Number(valuation.marketValueCents))}
                              </strong>
                              <span className="owner-sub">
                                {unit.areaM2
                                  ? `${money(Math.round(Number(valuation.marketValueCents) / unit.areaM2))}/m²`
                                  : unitValuationSources[valuation.source]}
                              </span>
                            </>
                          ) : (
                            <span className="status warn">Chybí valuace</span>
                          )}
                        </td>
                        <td>
                          {assessment ? (
                            <span
                              className={`status ${assessment.distributionReady ? "ok" : "warn"}`}
                            >
                              {assessment.distributionReady
                                ? "Připraveno"
                                : "Nepřipraveno"}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          {assessment ? (
                            <>
                              <strong>{date(assessment.assessedAt)}</strong>
                              <span className="owner-sub">
                                {assessment.createdBy.name} ·{" "}
                                {unit.assetAssessments.length} záznamů
                              </span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          <div className="distribution-actions">
                            <details className="distribution-assessment">
                              <summary>Nové hodnocení</summary>
                              <form
                                action={`/api/distribution/properties/${unit.property.id}/units/${unit.id}/assessments`}
                                method="post"
                              >
                                <label className="field">
                                  <span>Rating kvality *</span>
                                  <select
                                    name="rating"
                                    defaultValue={
                                      assessment?.rating || "B_GOOD"
                                    }
                                  >
                                    {Object.entries(unitQualityRatings).map(
                                      ([value, label]) => (
                                        <option value={value} key={value}>
                                          {label}
                                        </option>
                                      ),
                                    )}
                                  </select>
                                </label>
                                <label className="field">
                                  <span>Nutnost investice *</span>
                                  <select
                                    name="investmentUrgency"
                                    defaultValue={
                                      assessment?.investmentUrgency || "MONITOR"
                                    }
                                  >
                                    {Object.entries(
                                      unitInvestmentUrgencies,
                                    ).map(([value, label]) => (
                                      <option value={value} key={value}>
                                        {label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="field">
                                  <span>Odhad CAPEX Kč</span>
                                  <input
                                    type="number"
                                    name="estimatedCapex"
                                    min="0"
                                    step="0.01"
                                    defaultValue={moneyInput(
                                      assessment?.estimatedCapexCents,
                                    )}
                                  />
                                </label>
                                <label className="field">
                                  <span>Datum hodnocení *</span>
                                  <input
                                    type="date"
                                    name="assessedAt"
                                    max={dateInput(new Date())}
                                    defaultValue={dateInput(new Date())}
                                    required
                                  />
                                </label>
                                <label className="checkbox-field">
                                  <input
                                    type="checkbox"
                                    name="distributionReady"
                                    defaultChecked={
                                      assessment?.distributionReady || false
                                    }
                                  />
                                  <span>Interně připraveno pro distribuci</span>
                                </label>
                                <label className="field">
                                  <span>Poznámka / důvod</span>
                                  <textarea
                                    name="note"
                                    rows={2}
                                    placeholder="Stav, rozsah investice a další krok"
                                  />
                                </label>
                                <button className="primary" type="submit">
                                  Uložit nový snapshot
                                </button>
                              </form>
                              {unit.assetAssessments.length > 0 && (
                                <div className="assessment-history">
                                  <strong>Poslední historie</strong>
                                  {unit.assetAssessments.map((row) => (
                                    <span key={row.id}>
                                      {date(row.assessedAt)} ·{" "}
                                      {unitQualityRatings[row.rating]} ·{" "}
                                      {money(row.estimatedCapexCents)}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </details>
                            <details className="distribution-assessment distribution-valuation">
                              <summary>Nová valuace</summary>
                              <form
                                action={`/api/distribution/properties/${unit.property.id}/units/${unit.id}/valuations`}
                                method="post"
                              >
                                <label className="field">
                                  <span>Tržní hodnota Kč *</span>
                                  <input
                                    type="number"
                                    name="marketValue"
                                    min="0.01"
                                    step="0.01"
                                    required
                                  />
                                </label>
                                <label className="field">
                                  <span>Zdroj *</span>
                                  <select
                                    name="source"
                                    defaultValue="INTERNAL_COMPARABLES"
                                  >
                                    {Object.entries(unitValuationSources).map(
                                      ([value, label]) => (
                                        <option value={value} key={value}>
                                          {label}
                                        </option>
                                      ),
                                    )}
                                  </select>
                                </label>
                                <label className="field">
                                  <span>Datum valuace *</span>
                                  <input
                                    type="date"
                                    name="valuationDate"
                                    max={dateInput(new Date())}
                                    defaultValue={dateInput(new Date())}
                                    required
                                  />
                                </label>
                                <label className="field">
                                  <span>Reference / číslo posudku</span>
                                  <input name="reference" />
                                </label>
                                <label className="field">
                                  <span>Poznámka</span>
                                  <textarea name="note" rows={2} />
                                </label>
                                <button className="primary" type="submit">
                                  Uložit novou valuaci
                                </button>
                              </form>
                              {unit.valuationSnapshots.length > 0 && (
                                <div className="assessment-history">
                                  <strong>Poslední valuace</strong>
                                  {unit.valuationSnapshots.map((row) => (
                                    <span key={row.id}>
                                      {date(row.valuationDate)} ·{" "}
                                      {money(Number(row.marketValueCents))} ·{" "}
                                      {unitValuationSources[row.source]}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </details>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="table-empty" colSpan={9}>
                      V potvrzených aktivech FlatCloud zatím nejsou jednotky.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Shell>
  );
}
function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="card stat">
      <div className="stat-icon blue">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
