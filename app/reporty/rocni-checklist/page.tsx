import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, ClipboardCheck } from "lucide-react";
import { Shell } from "@/components/Shell";
import { requireUser } from "@/lib/auth";
import { hasReportingBackofficeAccess } from "@/lib/reporting/backoffice-access";
import { loadAnnualReadiness } from "@/lib/reporting/annual-readiness";
import { normalizeAnnualPackageYear } from "@/lib/reporting/annual-owner-package";

export const dynamic = "force-dynamic";
const annualStatuses: Record<string, string> = {
  DRAFT: "Koncept",
  REVIEW: "Ke kontrole",
  PUBLISHED: "Publikováno",
};

export default async function AnnualReadinessPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const [user, query] = await Promise.all([requireUser(), searchParams]);
  if (!(await hasReportingBackofficeAccess(user))) redirect("/reporty");
  const year = normalizeAnnualPackageYear(query.year);
  const rows = await loadAnnualReadiness(user, year);
  const readyCount = rows.filter((row) => row.tone === "ok").length;
  return (
    <Shell user={user}>
      <div className="page annual-checklist-page">
        <div className="breadcrumb">
          <Link href="/reporty/akcionarske">Akcionářské reporty</Link>
          <span>›</span>
          <span>Roční checklist</span>
        </div>
        <div className="page-title">
          <div>
            <span className="eyebrow">R22 · společná kontrolní fronta</span>
            <h1>Roční připravenost</h1>
            <p>
              Read-only kontrola Q4, výroční revize, valuací, rozpočtů a
              účetních podkladů podle reportovací skupiny.
            </p>
          </div>
          <span
            className={`status ${readyCount === rows.length && rows.length ? "ok" : "warn"}`}
          >
            {readyCount}/{rows.length} skupin připraveno
          </span>
        </div>
        <div className="notice">
          <ClipboardCheck size={19} />
          <div>
            <strong>Checklist nic automaticky neopravuje</strong>
            <span>
              Stav vychází z aktuální evidence a vede na zdrojové moduly.
              Publikované snapshoty, reporty ani účetní klasifikaci nemění.
            </span>
          </div>
        </div>
        <form className="card annual-package-filter" method="get">
          <label className="field">
            <span>Uzavřený rok</span>
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
            Načíst checklist
          </button>
          <Link
            className="secondary"
            href={`/reporty/rocni-podklady?year=${year}`}
          >
            Podklady vlastníků
          </Link>
        </form>
        <div className="annual-checklist-list">
          {rows.length ? (
            rows.map((row) => (
              <section
                className={`card annual-checklist-card ${row.tone}`}
                key={row.id}
              >
                <div className="card-head">
                  <div>
                    <h2>{row.name}</h2>
                    <p className="muted-copy">
                      {row.propertyCount} nemovitostí v rozsahu k 31. 12. {year}
                    </p>
                  </div>
                  {row.tone === "ok" ? (
                    <CheckCircle2 size={22} />
                  ) : (
                    <AlertTriangle size={22} />
                  )}
                </div>
                <div className="annual-checklist-grid">
                  <Check
                    label="Publikovaný Q4"
                    ok={Boolean(row.q4?.scopeMatches)}
                    detail={
                      row.q4
                        ? `Revize ${row.q4.revision}${row.q4.scopeMatches ? " · rozsah souhlasí" : " · neshoda rozsahu"}`
                        : "Chybí publikovaná Q4 revize"
                    }
                    href={
                      row.q4
                        ? `/reporty/kvartalni/${row.id}/reporty/${row.q4.id}`
                        : `/reporty/kvartalni/${row.id}`
                    }
                  />
                  <Check
                    label="Výroční revize"
                    ok={
                      row.annual?.status === "PUBLISHED" &&
                      row.annual.missingCount === 0
                    }
                    detail={
                      row.annual
                        ? `Revize ${row.annual.revision} · ${annualStatuses[row.annual.status]}${row.annual.missingCount ? ` · ${row.annual.missingCount} chybí` : ""}`
                        : "Výroční report nebyl založen"
                    }
                    href={
                      row.annual
                        ? `/reporty/vyrocni/${row.id}/reporty/${row.annual.id}`
                        : `/reporty/vyrocni/${row.id}`
                    }
                  />
                  <Check
                    label="Valuace"
                    ok={
                      row.missingValuationCount === 0 && row.propertyCount > 0
                    }
                    detail={
                      row.missingValuationCount
                        ? `${row.missingValuationCount} nemovitostí bez valuace v roce`
                        : "Pokrytí celého rozsahu"
                    }
                    href="/reporty?view=asset"
                  />
                  <Check
                    label="Rozpočty"
                    ok={row.missingBudgetCount === 0 && row.propertyCount > 0}
                    detail={
                      row.missingBudgetCount
                        ? `${row.missingBudgetCount} nemovitostí bez rozpočtu`
                        : "Rozpočet evidován u všech objektů"
                    }
                    href="/portfolio/kvalita/plan"
                  />
                  <Check
                    label="Náklady a doklady"
                    ok={row.unresolvedCostCount === 0}
                    detail={
                      row.unresolvedCostCount
                        ? `${row.unresolvedCostCount} z ${row.actualCostCount} nákladů vyžaduje doklad nebo kontrolu`
                        : `${row.actualCostCount} skutečných nákladů bez otevřené vady`
                    }
                    href={`/reporty/rocni-podklady?year=${year}`}
                  />
                </div>
                {row.annual?.missingPreview.length ? (
                  <p className="muted-copy">
                    První chybějící pole výroční revize:{" "}
                    {row.annual.missingPreview.join(" · ")}
                  </p>
                ) : null}
              </section>
            ))
          ) : (
            <div className="empty-state">
              <h2>Bez dostupných reportovacích skupin</h2>
              <p>
                Checklist respektuje stejná oprávnění jako kvartální a výroční
                editor.
              </p>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Check({
  label,
  ok,
  detail,
  href,
}: {
  label: string;
  ok: boolean;
  detail: string;
  href: string;
}) {
  return (
    <Link
      className={`annual-checklist-item ${ok ? "ok" : "attention"}`}
      href={href}
    >
      <span>
        {ok ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
      </span>
      <div>
        <strong>{label}</strong>
        <small>{detail}</small>
      </div>
      <b aria-hidden="true">›</b>
    </Link>
  );
}
