import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BarChart3,
  CalendarClock,
  Landmark,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { Flash } from "@/components/FormUi";
import { RentForecastChart } from "@/components/ReportChart";
import { Shell } from "@/components/Shell";
import { requireUser } from "@/lib/auth";
import { date, money } from "@/lib/format";
import {
  calculateSavedRentForecast,
  canManageRentForecastPlan,
  listAccessibleRentForecastPlanRevisions,
  loadAccessibleRentForecastPlan,
  parseRentForecastPlanSnapshot,
  rentForecastPlanStatuses,
} from "@/lib/reporting/rent-forecast-plans";
import {
  calculateRentForecastTransferPreview,
  rentForecastTransferStates,
} from "@/lib/reporting/rent-forecast-transfer-preview";
import {
  listRentChangeProposals,
  rentChangeProposalStatuses,
} from "@/lib/reporting/rent-change-proposals";

export const dynamic = "force-dynamic";
const pct = (value: number) =>
  `${(value / 100).toLocaleString("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
function Kpis({ items }: { items: Array<[string, string, React.ReactNode]> }) {
  return (
    <div className="stat-grid v21-stat-grid">
      {items.map(([label, value, icon]) => (
        <div className="card stat" key={label}>
          <div className="stat-icon blue">{icon}</div>
          <div>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function SavedRentForecastPage({
  params,
  searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requireUser(),
    { planId } = await params,
    query = await searchParams;
  let plan: Awaited<ReturnType<typeof loadAccessibleRentForecastPlan>>;
  try {
    plan = await loadAccessibleRentForecastPlan(user, planId);
  } catch {
    notFound();
  }
  const [revisions, canManage, proposals] = await Promise.all([
    listAccessibleRentForecastPlanRevisions(user, plan.seriesId),
    canManageRentForecastPlan(
      user,
      plan.properties.map((row) => row.propertyId),
    ),
    listRentChangeProposals(user, plan.id),
  ]);
  const proposalByLease = new Map(
    proposals.map((proposal) => [proposal.leaseId, proposal]),
  );
  const snapshot = parseRentForecastPlanSnapshot(plan.inputSnapshot),
    forecast = calculateSavedRentForecast(plan),
    transferPreview =
      plan.status === "APPROVED"
        ? calculateRentForecastTransferPreview(plan)
        : null;
  const returnScope = snapshot.scope.map((row) => row.propertyId).join(",");
  return (
    <Shell user={user}>
      <div className="page saved-forecast-page">
        <div className="breadcrumb">
            <Link href={`/reporty?view=forecast&properties=${encodeURIComponent(returnScope)}`}>
              ← Valorizace a forecast
            </Link>
        </div>
        <div className="page-title">
          <div>
            <span className="eyebrow">
              Uložený scénář · revize {plan.revision}
            </span>
            <h1>{plan.name}</h1>
            <p>
              Data k {date(plan.asOfDate)} ·{" "}
              {snapshot.scope.map((row) => row.propertyName).join(", ")}
            </p>
          </div>
          <span
            className={`status ${plan.status === "APPROVED" ? "ok" : plan.status === "DRAFT" ? "warn" : ""}`}
          >
            {rentForecastPlanStatuses[plan.status]}
          </span>
        </div>
        <Flash ok={query.ok} error={query.error} />
        <div className="notice asset-scope-note">
          <strong>
            Zmrazený plán · smlouvy a předpisy zůstávají beze změny
          </strong>
          <span>
            Tato revize se vždy počítá z uložených vstupů. Schválení potvrzuje
            plán pro další rozhodování, ale nevytváří dodatky ani nové předpisy.
          </span>
        </div>
        <div className="card saved-forecast-summary">
          <div className="card-head">
            <div>
              <h2>Předpoklady revize</h2>
              <p className="muted-copy">
                MF reference {snapshot.mfReferencePeriod} · vytvořil/a{" "}
                {plan.createdBy.name}
                {plan.approvedBy
                  ? ` · schválil/a ${plan.approvedBy.name} ${plan.approvedAt ? date(plan.approvedAt) : ""}`
                  : ""}
              </p>
            </div>
            <div className="mini-actions">
              {canManage && plan.status === "APPROVED" && (
                <form
                  action={`/api/rent-forecast-plans/${plan.id}/revisions`}
                  method="post"
                >
                  <button className="secondary" type="submit">
                    Nová revize z LIVE dat
                  </button>
                </form>
              )}
            </div>
          </div>
          <div className="contract-meta-row">
            <span>
              <b>Růst plánovaného nájmu</b>
              {pct(plan.annualGrowthBps)} ročně
            </span>
            <span>
              <b>Vacancy</b>
              {pct(plan.vacancyBps)}
            </span>
            <span>
              <b>Úspěšnost inkasa</b>
              {pct(plan.collectionBps)}
            </span>
            <span>
              <b>Využití MF rozdílu</b>
              {pct(plan.marketGapCaptureBps)}
            </span>
            <span>
              <b>Horizont</b>
              {plan.horizonMonths} měsíců
            </span>
          </div>
          {plan.note && <p className="saved-forecast-note">{plan.note}</p>}
          {plan.status === "DRAFT" && canManage && (
            <details className="forecast-approval-panel">
              <summary>Schválit tuto revizi</summary>
              <p>
                Schválení uzamkne rozhodovací stav této revize. Nevznikne
                dodatek, změna nájmu ani předpis.
              </p>
              <form
                action={`/api/rent-forecast-plans/${plan.id}/approve`}
                method="post"
              >
                <button className="primary" type="submit">
                  Potvrdit schválení plánu
                </button>
              </form>
            </details>
          )}
          {!canManage && (
            <div className="notice compact-notice">
              <strong>Pouze ke čtení</strong>
              <span>
                Schválení a novou revizi může vytvořit uživatel s právem
                upravovat všechny zahrnuté nemovitosti.
              </span>
            </div>
          )}
        </div>
        <Kpis
          items={[
            [
              "Aktivní smlouvy",
              String(forecast.leaseCount),
              <CalendarClock key="i" />,
            ],
            [
              "Smluvní příjem · horizont",
              money(forecast.contractualTotalCents),
              <WalletCards key="i" />,
            ],
            [
              "Plánovaný příjem · hrubý",
              money(forecast.plannedTotalCents),
              <TrendingUp key="i" />,
            ],
            [
              "Očekávané inkaso",
              money(forecast.expectedCollectedTotalCents),
              <BarChart3 key="i" />,
            ],
            [
              "Rozdíl plánu ke smlouvám",
              money(forecast.scenarioUpliftCents),
              <TrendingUp key="i" />,
            ],
            [
              "MF pokrytí",
              `${forecast.mfCoveredCount}/${forecast.leaseCount}`,
              <Landmark key="i" />,
            ],
          ]}
        />
        <div className="card report-chart-card">
          <div className="report-chart-heading">
            <div>
              <h2>Měsíční vývoj uložené revize</h2>
              <p className="muted-copy">
                Čisté nájemné bez služeb; výpočet používá výhradně zmrazený
                snapshot.
              </p>
            </div>
            <span className="scope-context-badge">
              Revize {plan.revision} · {rentForecastPlanStatuses[plan.status]}
            </span>
          </div>
          <RentForecastChart data={forecast.months} />
        </div>
        {transferPreview ? (
          <div className="card forecast-transfer-preview">
            <div className="card-head">
              <div>
                <span className="eyebrow">Další krok po schválení</span>
                <h2>Náhled převodu do dodatků</h2>
                <p className="muted-copy">
                  Kontrolní seznam pro cílové období{" "}
                  {transferPreview.effectivePeriod}. Výpočet pouze porovnává
                  uložený plán se smluvní křivkou.
                </p>
              </div>
              <span className="status warn">Dry run · bez zápisu</span>
            </div>
            <div className="notice compact-notice">
              <strong>Nic se zatím nepřenáší do evidence</strong>
              <span>
                Náhled nevytváří ani neupravuje smlouvu, dodatek, složku
                předpisu či předpis. Každý návrh je nutné nejprve právně a
                provozně posoudit.
              </span>
            </div>
            <div className="forecast-transfer-counts">
              <span>
                <b>{transferPreview.addendumReviewCount}</b>K posouzení dodatku
              </span>
              <span>
                <b>{transferPreview.renewalRequiredCount}</b>Nejprve obnovit
                nájem
              </span>
              <span>
                <b>{transferPreview.indexationReviewCount}</b>Nejprve zohlednit
                indexaci
              </span>
              <span>
                <b>{transferPreview.noChangeCount}</b>Bez navržené změny
              </span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nemovitost / jednotka</th>
                    <th>Dnešní nájem</th>
                    <th>Smluvně v cíli</th>
                    <th>Návrh v cíli</th>
                    <th>Rozdíl</th>
                    <th>Účinnost</th>
                    <th>Stav</th>
                    <th>Akce</th>
                  </tr>
                </thead>
                <tbody>
                  {transferPreview.rows.length ? (
                    transferPreview.rows.map((row) => {
                      const proposal = proposalByLease.get(row.leaseId);
                      return (
                        <tr key={row.leaseId}>
                          <td>
                            <Link
                              className="table-link"
                              href={`/smlouvy/${row.leaseId}`}
                            >
                              {row.propertyName} · {row.unitLabel}
                            </Link>
                          </td>
                          <td>{money(row.currentRentCents)}</td>
                          <td>{money(row.contractualRentCents)}</td>
                          <td>{money(row.proposedRentCents)}</td>
                          <td>{money(row.differenceCents)}</td>
                          <td>{row.effectivePeriod}</td>
                          <td>
                            <span
                              className={`status ${row.state === "NO_CHANGE" ? "ok" : row.state === "RENEWAL_REQUIRED" ? "bad" : "warn"}`}
                            >
                              {rentForecastTransferStates[row.state]}
                            </span>
                          </td>
                          <td>
                            {proposal ? (
                              <Link
                                className="table-link"
                                href={`/reporty/valorizace/${plan.id}/navrhy/${proposal.id}`}
                              >
                                {rentChangeProposalStatuses[proposal.status]}
                              </Link>
                            ) : canManage && row.state === "ADDENDUM_REVIEW" ? (
                              <details className="rent-change-create">
                                <summary>Připravit změnu</summary>
                                <form
                                  action={`/api/rent-forecast-plans/${plan.id}/proposals`}
                                  method="post"
                                >
                                  <input
                                    type="hidden"
                                    name="leaseId"
                                    value={row.leaseId}
                                  />
                                  <label className="field">
                                    <span>Účinnost od</span>
                                    <input
                                      type="date"
                                      name="effectiveFrom"
                                      defaultValue={`${row.effectivePeriod}-01`}
                                      required
                                    />
                                  </label>
                                  <label className="field">
                                    <span>Právní důvod</span>
                                    <select name="legalBasis" required>
                                      <option value="Dohoda smluvních stran formou dodatku">
                                        Dohoda smluvních stran · dodatek
                                      </option>
                                      <option value="Smluvní valorizační ujednání">
                                        Smluvní valorizační ujednání
                                      </option>
                                      <option value="Nová dohoda při prodloužení nájmu">
                                        Nová dohoda při prodloužení
                                      </option>
                                    </select>
                                  </label>
                                  <label className="field">
                                    <span>Poznámka</span>
                                    <input
                                      name="note"
                                      placeholder="Interní kontext rozhodnutí"
                                    />
                                  </label>
                                  <button className="primary" type="submit">
                                    Pokračovat ke kontrole
                                  </button>
                                </form>
                              </details>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="table-empty">
                        Snapshot neobsahuje aktivní smlouvy.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="notice forecast-transfer-locked">
            <strong>Náhled převodu se zobrazí po schválení</strong>
            <span>
              Nejprve potvrďte tuto revizi jako rozhodovací plán. Ani potom se
              smlouvy ani předpisy automaticky nezmění.
            </span>
          </div>
        )}
        <div className="card portfolio-table-card">
          <div className="table-toolbar">
            <h2>Cíle po jednotkách</h2>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nemovitost / jednotka</th>
                  <th>Současné nájemné</th>
                  <th>MF reference</th>
                  <th>Smluvně na konci</th>
                  <th>Plán na konci</th>
                  <th>Rozdíl</th>
                </tr>
              </thead>
              <tbody>
                {forecast.unitRows.length ? (
                  forecast.unitRows.map((row) => (
                    <tr key={row.leaseId}>
                      <td>
                        <Link
                          className="table-link"
                          href={`/smlouvy/${row.leaseId}`}
                        >
                          {row.propertyName} · {row.unitLabel}
                        </Link>
                      </td>
                      <td>{money(row.currentRentCents)}</td>
                      <td>
                        {row.mfMarketRentCents == null
                          ? "Bez MF"
                          : money(row.mfMarketRentCents)}
                      </td>
                      <td>{money(row.finalContractualCents)}</td>
                      <td>{money(row.finalPlannedCents)}</td>
                      <td>{money(row.plannedUpliftCents)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="table-empty">
                      Snapshot neobsahuje aktivní smlouvy.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card forecast-revision-history">
          <div className="card-head">
            <div>
              <h2>Historie revizí</h2>
              <p className="muted-copy">
                Každá revize zůstává samostatně dohledatelná.
              </p>
            </div>
          </div>
          <div className="revision-list">
            {revisions.map((item) => (
              <Link
                className={item.id === plan.id ? "active" : ""}
                href={`/reporty/valorizace/${item.id}`}
                key={item.id}
              >
                <span>
                  <strong>Revize {item.revision}</strong>
                  <small>
                    {date(item.createdAt)} · {item.createdBy.name}
                  </small>
                </span>
                <span
                  className={`status ${item.status === "APPROVED" ? "ok" : item.status === "DRAFT" ? "warn" : ""}`}
                >
                  {rentForecastPlanStatuses[item.status]}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}
