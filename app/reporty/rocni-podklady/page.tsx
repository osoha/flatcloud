import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Landmark,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { MethodologyCallout } from "@/components/MethodologyCallout";
import { hasAllPropertyAccess, requireUser } from "@/lib/auth";
import { date, money } from "@/lib/format";
import { moneyInput } from "@/lib/forms";
import {
  loadAnnualOwnerPackage,
  normalizeAnnualPackageYear,
} from "@/lib/reporting/annual-owner-package";
import { propertyCostCategories, propertyCostKinds } from "@/lib/asset-finance";

export const dynamic = "force-dynamic";
const annualReviewStatuses = {
  DRAFT: "Rozpracováno",
  READY_FOR_ACCOUNTANT: "Připraveno pro účetního",
  CONFIRMED_BY_ACCOUNTANT: "Potvrzeno účetním",
  EXCLUDED: "Vyloučeno z balíčku",
} as const;
export default async function AnnualOwnerPackagePage({
  searchParams,
}: {
  searchParams: Promise<{
    ownerId?: string;
    year?: string;
    ok?: string;
    error?: string;
  }>;
}) {
  const [user, query] = await Promise.all([requireUser(), searchParams]);
  const year = normalizeAnnualPackageYear(query.year);
  const data = await loadAnnualOwnerPackage(user, {
    ownerId: query.ownerId,
    year,
  });
  const selectedOwnerId = data.selectedOwner?.id || "";
  const exportHref = data.selectedOwner
    ? `/api/reports/annual-owner-package.csv?ownerId=${encodeURIComponent(data.selectedOwner.id)}&year=${year}`
    : null;
  const canEditEvidence = hasAllPropertyAccess(user);
  return (
    <Shell user={user}>
      <div className="page annual-package-page">
        <div className="breadcrumb">Reporty › Roční podklady vlastníka</div>
        <div className="page-title">
          <div>
            <h1>Roční podklady vlastníka</h1>
            <p>
              {data.periodMode === "CLOSED"
                ? `Uzavřený kalendářní rok ${year}.`
                : `Průběžné podklady ${year} do ${date(new Date(`${data.dataThrough}T12:00:00Z`))}; rok ještě není uzavřený.`}{" "}
              Příjmy, skutečné výdaje, doklady a kontrola úvěrů.
            </p>
          </div>
          {exportHref && (
            <Link className="primary" href={exportHref}>
              <Download size={16} />{" "}
              {data.periodMode === "CLOSED"
                ? "Stáhnout CSV"
                : "Stáhnout pracovní YTD CSV"}
            </Link>
          )}
        </div>
        <nav className="report-tabs" aria-label="Report Center views">
          <Link href="/reporty">Zpět na reporty</Link>
          <Link className="active" href="/reporty/rocni-podklady">
            Roční podklady
          </Link>
        </nav>
        <Flash ok={query.ok} error={query.error} />
        <form className="card annual-package-filter" method="get">
          <label className="field">
            <span>Vlastník *</span>
            <select
              name="ownerId"
              defaultValue={data.selectedOwner?.id || ""}
              required
            >
              <option value="">Vyberte vlastníka</option>
              {data.owners.map((owner) => (
                <option value={owner.id} key={owner.id}>
                  {owner.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Rok *</span>
            <input
              type="number"
              name="year"
              min="2000"
              max={new Date().getUTCFullYear()}
              defaultValue={year}
              required
            />
          </label>
          <button className="primary" type="submit">
            Načíst podklady
          </button>
        </form>
        {!data.selectedOwner ? (
          <div className="empty-state annual-package-empty">
            <FileSpreadsheet size={28} />
            <h2>Nejprve vyberte vlastníka</h2>
            <p>
              Rozsah se skládá pouze z nemovitostí a jednotek, ke kterým máte
              přístup. Balíček nepoužívá konsolidační podíl FlatCloud.
            </p>
          </div>
        ) : (
          <>
            <div
              className={`notice annual-readiness ${data.ready ? "ok" : "warn"}`}
            >
              {data.ready ? (
                <CheckCircle2 size={20} />
              ) : (
                <AlertTriangle size={20} />
              )}
              <div>
                <strong>
                  {data.ready
                    ? "Podklady nemají blokátor"
                    : data.periodMode === "YTD"
                      ? "Průběžné YTD podklady – rok není uzavřený"
                      : "Podklady vyžadují doplnění"}
                </strong>
                <span>
                  {data.ready
                    ? "Před předáním účetnímu ještě proveďte odbornou kontrolu kategorizace."
                    : `Data jsou omezena do ${date(new Date(`${data.dataThrough}T12:00:00Z`))}. CSV lze stáhnout jako pracovní seznam, ale nesmí působit jako hotové daňové přiznání.`}
                </span>
              </div>
            </div>
            <div className="stat-grid v21-stat-grid annual-package-kpis">
              <Stat
                label="Přijaté úhrady"
                value={money(data.totals.incomeCents)}
                icon={<WalletCards />}
              />
              <Stat
                label="Z toho nájemné"
                value={money(data.totals.rentIncomeCents)}
                icon={<Landmark />}
              />
              <Stat
                label="Skutečné výdaje"
                value={money(data.totals.expenseCents)}
                icon={<ReceiptText />}
              />
              <Stat
                label="Pracovní rozdíl"
                value={money(data.totals.differenceCents)}
                icon={<FileSpreadsheet />}
              />
            </div>
            <div className="notice">
              <strong>Co čísla znamenají</strong>
              <span>
                Cash příjmy vycházejí z data bankovní transakce a přiřazené
                částky. Kauce ({money(data.totals.depositIncomeCents)}) jsou z
                pracovního rozdílu vyloučené. Výdaje obsahují jen stav
                Skutečnost. Nejde o automatické stanovení základu daně.
              </span>
            </div>
            <section className="card annual-evidence-editor">
              <div className="card-head">
                <div>
                  <h2>Historická vlastnická struktura</h2>
                  <p className="muted-copy">
                    Potvrzené intervaly určují podíl přesně k datu úhrady nebo
                    nákladu. Součet aktivních podílů musí být 100 %.
                  </p>
                </div>
              </div>
              {data.ownershipPeriods.length ? (
                <div className="annual-period-list">
                  {data.ownershipPeriods.map((period) => (
                    <div key={period.id}>
                      <span>
                        {period.scope} · {period.scopeLabel}
                      </span>
                      <strong>
                        {period.owner.name} ·{" "}
                        {(period.shareBasisPoints / 100).toLocaleString(
                          "cs-CZ",
                        )}{" "}
                        %
                      </strong>
                      <small>
                        {date(period.validFrom)} –{" "}
                        {period.validTo ? date(period.validTo) : "dosud"}
                      </small>
                      {canEditEvidence && (
                        <form
                          action="/api/reports/annual-owner-package/evidence"
                          method="post"
                        >
                          <input
                            type="hidden"
                            name="mode"
                            value="ownership-delete"
                          />
                          <input
                            type="hidden"
                            name="returnOwnerId"
                            value={selectedOwnerId}
                          />
                          <input type="hidden" name="returnYear" value={year} />
                          <input
                            type="hidden"
                            name="periodId"
                            value={period.id}
                          />
                          <button className="text-button danger" type="submit">
                            Odebrat období
                          </button>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="table-empty">
                  Pro vybraného vlastníka zatím není potvrzen žádný historický
                  interval.
                </div>
              )}
              {canEditEvidence && (
                <details className="create-panel">
                  <summary>Přidat účinný vlastnický podíl</summary>
                  <form
                    className="form-grid"
                    action="/api/reports/annual-owner-package/evidence"
                    method="post"
                  >
                    <input type="hidden" name="mode" value="ownership" />
                    <input
                      type="hidden"
                      name="returnOwnerId"
                      value={selectedOwnerId}
                    />
                    <input type="hidden" name="returnYear" value={year} />
                    <input
                      type="hidden"
                      name="ownerId"
                      value={selectedOwnerId}
                    />
                    <label className="field">
                      <span>Nemovitost *</span>
                      <select name="propertyId" required>
                        <option value="">Vyberte</option>
                        {data.editorScopes.map((property) => (
                          <option value={property.id} key={property.id}>
                            {property.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Jednotka (volitelně)</span>
                      <select name="unitId">
                        <option value="">Celá nemovitost</option>
                        {data.editorScopes.flatMap((property) =>
                          property.units.map((unit) => (
                            <option value={unit.id} key={unit.id}>
                              {property.name} · {unit.label}
                            </option>
                          )),
                        )}
                      </select>
                    </label>
                    <label className="field">
                      <span>Podíl % *</span>
                      <input
                        name="sharePercent"
                        type="number"
                        min="0.01"
                        max="100"
                        step="0.01"
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Účinný od *</span>
                      <input name="validFrom" type="date" required />
                    </label>
                    <label className="field">
                      <span>Účinný do</span>
                      <input name="validTo" type="date" />
                    </label>
                    <label className="field field-full">
                      <span>Zdroj / poznámka</span>
                      <input
                        name="sourceNote"
                        placeholder="Smlouva, výpis KN nebo potvrzený stav"
                      />
                    </label>
                    <button className="primary" type="submit">
                      Uložit období
                    </button>
                  </form>
                </details>
              )}
            </section>
            {data.issues.length > 0 && (
              <section className="card annual-issues">
                <div className="card-head">
                  <div>
                    <h2>Kontrola úplnosti</h2>
                    <p className="muted-copy">
                      {
                        data.issues.filter(
                          (issue) => issue.severity === "BLOCKER",
                        ).length
                      }{" "}
                      blokátorů ·{" "}
                      {
                        data.issues.filter(
                          (issue) => issue.severity === "WARNING",
                        ).length
                      }{" "}
                      upozornění
                    </p>
                  </div>
                </div>
                <div className="stack-list">
                  {data.issues.map((issue) => (
                    <div
                      className={`annual-issue ${issue.severity === "BLOCKER" ? "bad" : "warn"}`}
                      key={issue.code}
                    >
                      <AlertTriangle size={17} />
                      <span>
                        <strong>
                          {issue.severity === "BLOCKER" ? "Blokátor" : "Ověřit"}
                        </strong>
                        {issue.message}
                      </span>
                      {issue.href && (
                        <Link className="table-link" href={issue.href}>
                          Doplnit
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
            <section className="card portfolio-table-card">
              <div className="table-toolbar">
                <div>
                  <h2>Přijaté úhrady</h2>
                  <p>
                    Částky jsou rozdělené podle skladby předpisu a současného
                    podílu vlastníka.
                  </p>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Nemovitost / jednotka</th>
                      <th>Nájemník</th>
                      <th>Přijato</th>
                      <th>Podíl vlastníka</th>
                      <th>Nájemné</th>
                      <th>Služby</th>
                      <th>Kauce</th>
                      <th>Ostatní</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.incomeRows.length ? (
                      data.incomeRows.map((row) => (
                        <tr key={row.id}>
                          <td>{date(row.bookedAt)}</td>
                          <td>
                            <strong>
                              {row.propertyName} · {row.unitLabel}
                            </strong>
                            <span className="owner-sub">
                              VS {row.variableSymbol || "—"}
                            </span>
                          </td>
                          <td>{row.tenantName}</td>
                          <td>{money(row.receivedCents)}</td>
                          <td>
                            <strong>{money(row.ownerAmountCents)}</strong>
                            <span className="owner-sub">
                              {row.allocationNote}
                            </span>
                          </td>
                          <td>{money(row.rentCents)}</td>
                          <td>{money(row.servicesCents)}</td>
                          <td>{money(row.depositCents)}</td>
                          <td>{money(row.otherCents)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={9} className="table-empty">
                          Bez přiřazených úhrad v tomto roce.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="card portfolio-table-card">
              <div className="table-toolbar">
                <div>
                  <h2>Skutečné výdaje</h2>
                  <p>
                    Účetní doklady pokrývají{" "}
                    {money(data.totals.documentedExpenseCents)} z{" "}
                    {money(data.totals.expenseCents)} přiřazených výdajů. Pouze
                    podpůrnými přílohami je doloženo{" "}
                    {money(data.totals.supportedOnlyExpenseCents)}.
                  </p>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Nemovitost</th>
                      <th>Náklad</th>
                      <th>Typ / kategorie</th>
                      <th>Zdrojová částka</th>
                      <th>Podíl vlastníka</th>
                      <th>Účetní evidence</th>
                      <th>Odborná kontrola</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.expenseRows.length ? (
                      data.expenseRows.map((row) => (
                        <tr id={`cost-${row.id}`} key={row.id}>
                          <td>{date(row.effectiveAt)}</td>
                          <td>{row.propertyName}</td>
                          <td>
                            <Link
                              className="entity-link"
                              href={`/nemovitosti/${row.propertyId}/naklady/${row.id}`}
                            >
                              {row.title}
                            </Link>
                            <span className="owner-sub">
                              {row.allocationNote}
                            </span>
                          </td>
                          <td>
                            {
                              propertyCostKinds[
                                row.kind as keyof typeof propertyCostKinds
                              ]
                            }{" "}
                            ·{" "}
                            {
                              propertyCostCategories[
                                row.category as keyof typeof propertyCostCategories
                              ]
                            }
                          </td>
                          <td>{money(row.sourceAmountCents)}</td>
                          <td>
                            <strong>{money(row.ownerAmountCents)}</strong>
                          </td>
                          <td>
                            <ExpenseEvidence row={row} />
                          </td>
                          <td>
                            <span
                              className={`status ${row.annualReviewStatus === "CONFIRMED_BY_ACCOUNTANT" ? "ok" : "warn"}`}
                            >
                              {
                                annualReviewStatuses[
                                  row.annualReviewStatus as keyof typeof annualReviewStatuses
                                ]
                              }
                            </span>
                            {row.annualReviewedBy && (
                              <span className="owner-sub">
                                {row.annualReviewedBy}
                              </span>
                            )}
                            {canEditEvidence && (
                              <details className="annual-inline-review">
                                <summary>Upravit</summary>
                                <form
                                  action="/api/reports/annual-owner-package/evidence"
                                  method="post"
                                >
                                  <input
                                    type="hidden"
                                    name="mode"
                                    value="cost-review"
                                  />
                                  <input
                                    type="hidden"
                                    name="returnOwnerId"
                                    value={selectedOwnerId}
                                  />
                                  <input
                                    type="hidden"
                                    name="returnYear"
                                    value={year}
                                  />
                                  <input
                                    type="hidden"
                                    name="costId"
                                    value={row.id}
                                  />
                                  <select
                                    name="reviewStatus"
                                    defaultValue={row.annualReviewStatus}
                                  >
                                    {Object.entries(annualReviewStatuses).map(
                                      ([value, label]) => (
                                        <option value={value} key={value}>
                                          {label}
                                        </option>
                                      ),
                                    )}
                                  </select>
                                  <input
                                    name="note"
                                    defaultValue={row.annualReviewNote || ""}
                                    placeholder="Poznámka účetního"
                                  />
                                  <button className="secondary" type="submit">
                                    Uložit
                                  </button>
                                </form>
                              </details>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8} className="table-empty">
                          Bez skutečných výdajů přiřazených tomuto vlastníkovi.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="card portfolio-table-card">
              <div className="table-toolbar">
                <div>
                  <h2>Úvěry a úroky</h2>
                  <p>
                    Sazba a jistina slouží jen ke kontrole úplnosti. Evidovaný
                    zaplacený úrok: {money(data.totals.interestPaidCents)}.
                  </p>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nemovitost</th>
                      <th>Úvěr</th>
                      <th>Věřitel</th>
                      <th>Jistina dle evidence</th>
                      <th>Sazba</th>
                      <th>Stav k</th>
                      <th>Úrok zaplacený za rok</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.loanRows.length ? (
                      data.loanRows.map((row) => (
                        <tr id={`loan-${row.id}`} key={row.id}>
                          <td>{row.propertyName}</td>
                          <td>
                            <strong>{row.label}</strong>
                          </td>
                          <td>{row.lender}</td>
                          <td>{money(row.outstandingPrincipalCents)}</td>
                          <td>
                            {(row.annualInterestRateBps / 100).toLocaleString(
                              "cs-CZ",
                              { minimumFractionDigits: 2 },
                            )}{" "}
                            %
                          </td>
                          <td>
                            {row.asOfDate
                              ? date(row.asOfDate)
                              : "Aktuální karta"}
                          </td>
                          <td>
                            <span
                              className={`status ${row.reviewStatus === "CONFIRMED_BY_ACCOUNTANT" && row.documentTitle ? "ok" : "warn"}`}
                            >
                              {row.interestPaidCents === null
                                ? "Nedoloženo"
                                : money(row.interestPaidCents)}
                            </span>
                            <span className="owner-sub">{row.evidence}</span>
                            {canEditEvidence && (
                              <details className="annual-inline-review">
                                <summary>Upravit roční úrok</summary>
                                <form
                                  action="/api/reports/annual-owner-package/evidence"
                                  method="post"
                                >
                                  <input
                                    type="hidden"
                                    name="mode"
                                    value="loan-interest"
                                  />
                                  <input
                                    type="hidden"
                                    name="returnOwnerId"
                                    value={selectedOwnerId}
                                  />
                                  <input
                                    type="hidden"
                                    name="returnYear"
                                    value={year}
                                  />
                                  <input
                                    type="hidden"
                                    name="loanId"
                                    value={row.id}
                                  />
                                  <input
                                    type="hidden"
                                    name="year"
                                    value={year}
                                  />
                                  <input
                                    name="interestPaid"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    defaultValue={moneyInput(
                                      row.interestPaidCents,
                                    )}
                                  />
                                  <select
                                    name="documentId"
                                    defaultValue={row.documentId || ""}
                                  >
                                    <option value="">Bez dokladu</option>
                                    {row.documentOptions.map((document) => (
                                      <option
                                        value={document.id}
                                        key={document.id}
                                      >
                                        {document.title}
                                      </option>
                                    ))}
                                  </select>
                                  <select
                                    name="reviewStatus"
                                    defaultValue={row.reviewStatus}
                                  >
                                    {Object.entries(annualReviewStatuses).map(
                                      ([value, label]) => (
                                        <option value={value} key={value}>
                                          {label}
                                        </option>
                                      ),
                                    )}
                                  </select>
                                  <input
                                    name="note"
                                    placeholder="Zdroj a poznámka"
                                  />
                                  <button className="secondary" type="submit">
                                    Uložit
                                  </button>
                                </form>
                              </details>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="table-empty">
                          Bez aktivních úvěrů v dostupném rozsahu.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            <MethodologyCallout slug="rocni-podklady" compact />
          </>
        )}
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
function ExpenseEvidence({
  row,
}: {
  row: {
    evidenceStatus: "ACCOUNTING_DOCUMENT" | "SUPPORT_ONLY" | "MISSING";
    accountingDocumentCount: number;
    supportingDocumentCount: number;
    documentNumber: string | null;
  };
}) {
  if (row.evidenceStatus === "ACCOUNTING_DOCUMENT")
    return (
      <>
        <span className="status ok">
          {row.accountingDocumentCount}× účetní doklad
        </span>
        {row.supportingDocumentCount > 0 && (
          <span className="owner-sub">
            + {row.supportingDocumentCount} podpůrných příloh
          </span>
        )}
        {row.documentNumber && (
          <span className="owner-sub">Číslo {row.documentNumber}</span>
        )}
      </>
    );
  if (row.evidenceStatus === "SUPPORT_ONLY")
    return (
      <>
        <span className="status warn">Pouze podpůrná příloha</span>
        <span className="owner-sub">
          {row.supportingDocumentCount} souborů · doplňte fakturu
        </span>
      </>
    );
  return (
    <>
      <span className="status warn">Chybí účetní doklad</span>
      {row.documentNumber && (
        <span className="owner-sub">
          Číslo {row.documentNumber} bez přílohy
        </span>
      )}
    </>
  );
}
