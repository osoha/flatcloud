import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BarChart3,
  Building2,
  CalendarClock,
  CircleDollarSign,
  ClipboardCheck,
  Download,
} from "lucide-react";
import { Shell } from "@/components/Shell";
import { canSeeAll, requireUser } from "@/lib/auth";
import { date, money } from "@/lib/format";
import { loadDistributionReport } from "@/lib/distribution/reporting";
export const dynamic = "force-dynamic";
export default async function DistributionReportingPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const [user, query] = await Promise.all([requireUser(), searchParams]);
  if (!canSeeAll(user.role)) redirect("/portfolio");
  const data = await loadDistributionReport(user, query.period),
    options = periodOptions();
  return (
    <Shell user={user}>
      <div className="page distribution-reporting-page">
        <div className="breadcrumb">
          <Link href="/distribuce">Interní distribuce</Link>
          <span>›</span>
          <span>Reportovací podklady</span>
        </div>
        <div className="page-title">
          <div>
            <h1>Distribuční podklady pro akcionáře</h1>
            <p>
              {data.period.label} · {data.scopeLabel} · data k{" "}
              {date(data.generatedAt)}
            </p>
          </div>
          <Link
            className="primary"
            href={`/api/distribution/report.csv?period=${data.period.key}`}
          >
            <Download size={16} /> Stáhnout CSV bez osobních údajů
          </Link>
        </div>
        <form className="card distribution-report-filter" method="get">
          <label className="field">
            <span>Období aktivity</span>
            <select name="period" defaultValue={data.period.key}>
              {options.map((item) => (
                <option value={item.key} key={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <button className="primary">Načíst období</button>
          <span>
            {"Stav technických podkladů, valuací a pipeline je LIVE; období omezuje nově založené příležitosti a zaznamenané pohyby funnelu."}
          </span>
        </form>
        <div className="notice">
          <strong>Bez PII a bez historizace fáze v LIVE řezu</strong>
          <span>
            Export neobsahuje jména, e-maily ani telefony zájemců. Fáze jsou
            dnešní LIVE stav; samostatný historický řez níže počítá neměnné
            události funnelu ve zvoleném období. Pro účetní nebo právní závěr
            nepoužívejte tento přehled bez kontroly.
          </span>
        </div>
        <div className="stat-grid v21-stat-grid distribution-report-kpis">
          <Stat
            label="Jednotky"
            value={String(data.totals.unitCount)}
            icon={<Building2 />}
          />
          <Stat
            label="Technický podklad / valuace"
            value={`${data.totals.assessedCount}/${data.totals.valuedCount}`}
            icon={<ClipboardCheck />}
          />
          <Stat
            label="Tržní hodnota"
            value={money(data.totals.marketValueCents)}
            icon={<CircleDollarSign />}
          />
          <Stat
            label="Odhad CAPEX"
            value={money(data.totals.estimatedCapexCents)}
            icon={<BarChart3 />}
          />
          <Stat
            label="Otevřené příležitosti"
            value={String(data.totals.openOpportunityCount)}
            icon={<CalendarClock />}
          />
          <Stat
            label={`Nové · ${data.period.label}`}
            value={String(data.totals.newOpportunityCount)}
            icon={<CalendarClock />}
          />
          <Stat
            label={`Pohyby · ${data.period.label}`}
            value={String(data.totals.funnelEventCount)}
            icon={<BarChart3 />}
          />
          <Stat
            label="Podepsané opce v období"
            value={String(data.totals.signedOptionCount)}
            icon={<ClipboardCheck />}
          />
        </div>
        <section className="card distribution-stage-card">
          <div className="card-head">
            <div>
              <h2>LIVE fáze pipeline</h2>
              <p className="muted-copy">Agregace bez identifikace zájemců.</p>
            </div>
          </div>
          <div className="distribution-stage-grid">
            {Object.entries(data.stageLabels).map(([stage, label]) => (
              <div key={stage}>
                <span>{label}</span>
                <strong>{data.totals.stageCounts[stage] || 0}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="card distribution-stage-card">
          <div className="card-head">
            <div>
              <h2>Pohyby funnelu · {data.period.label}</h2>
              <p className="muted-copy">
                Počet neměnných událostí podle cílové fáze; nejde o dnešní stav.
              </p>
            </div>
          </div>
          <div className="distribution-stage-grid">
            {Object.entries(data.stageLabels).map(([stage, label]) => (
              <div key={stage}>
                <span>{label}</span>
                <strong>{data.totals.stageActivityCounts[stage] || 0}</strong>
              </div>
            ))}
          </div>
          <p className="muted-copy">
            Podepsané opce: {data.totals.signedOptionCount} · využité opce: {data.totals.exercisedOptionCount}
          </p>
        </section>
        <section className="card portfolio-table-card">
          <div className="table-toolbar">
            <div>
              <h2>Podklad podle nemovitostí</h2>
              <p>
                {data.totals.issueCount}{" mezer v technickém hodnocení, valuaci nebo připravenosti."}
              </p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nemovitost</th>
                  <th>Jednotky</th>
                  <th>Technický podklad</th>
                  <th>Valuace</th>
                  <th>Připraveno</th>
                  <th>Urgentní</th>
                  <th>Tržní hodnota</th>
                  <th>CAPEX</th>
                  <th>Otevřené</th>
                  <th>Nové v období</th>
                  <th>Pohyby v období</th>
                  <th>Podepsané opce</th>
                  <th>Mezery</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length ? (
                  data.rows.map((row) => (
                    <tr key={row.propertyId}>
                      <td>
                        <Link
                          className="entity-link"
                          href={`/nemovitosti/${row.propertyId}/prehled`}
                        >
                          {row.propertyName}
                        </Link>
                      </td>
                      <td>{row.unitCount}</td>
                      <td>
                        {row.assessedCount}/{row.unitCount}
                      </td>
                      <td>
                        {row.valuedCount}/{row.unitCount}
                      </td>
                      <td>{row.readyCount}</td>
                      <td>{row.urgentCount}</td>
                      <td>{money(row.marketValueCents)}</td>
                      <td>{money(row.estimatedCapexCents)}</td>
                      <td>{row.openOpportunityCount}</td>
                      <td>{row.newOpportunityCount}</td>
                      <td>{row.funnelEventCount}</td>
                      <td>{row.signedOptionCount}</td>
                      <td>
                        <span
                          className={`status ${row.issues.length ? "warn" : "ok"}`}
                        >
                          {row.issues.length || "Bez mezer"}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={13} className="table-empty">
                      Bez potvrzených aktiv FlatCloud.
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
function periodOptions() {
  const now = new Date(),
    result: Array<{ key: string; label: string }> = [];
  for (let offset = 0; offset < 8; offset++) {
    const month = now.getUTCMonth() - offset * 3,
      date = new Date(Date.UTC(now.getUTCFullYear(), month, 1)),
      quarter = Math.floor(date.getUTCMonth() / 3) + 1;
    result.push({
      key: `${date.getUTCFullYear()}-Q${quarter}`,
      label: `Q${quarter} ${date.getUTCFullYear()}`,
    });
  }
  for (let y = now.getUTCFullYear(); y >= now.getUTCFullYear() - 3; y--)
    result.push({ key: String(y), label: `Rok ${y}` });
  return result;
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
