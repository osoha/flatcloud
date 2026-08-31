import { quarterSnapshotQualitySchema } from "@/lib/reporting/snapshot-schema";
import type { QuarterlySnapshotCandidate, QuarterlySnapshotView } from "./types";

function QualitySummary({ quality }: { quality: unknown }) {
  const parsed = quarterSnapshotQualitySchema.safeParse(quality);
  if (!parsed.success) return <span>Kvalitu dat se nepodařilo načíst.</span>;
  const counts = { INFO: 0, WARNING: 0, BLOCKER: 0 };
  for (const issue of parsed.data.issues) counts[issue.severity] += 1;
  return <span>INFO {counts.INFO} · WARNING {counts.WARNING} · BLOCKER {counts.BLOCKER}</span>;
}

export function QuarterlyReportDataPanel({ snapshot, candidates, editable, baseAction }: { snapshot: QuarterlySnapshotView; candidates: QuarterlySnapshotCandidate[]; editable: boolean; baseAction: string }) {
  return <details className="card quarterly-data-panel"><summary><span><strong>Data a snapshot</strong><small>Revize {snapshot.revision} · {snapshot.source}</small></span><QualitySummary quality={snapshot.quality}/></summary><div className="quarterly-data-panel-body">
    <div className="quarterly-provenance"><strong>Snapshot revize {snapshot.revision}</strong><span>{snapshot.source} · schéma {snapshot.schemaVersion} · kalkulátor {snapshot.calculatorVersion}</span><span>Vytvořeno {snapshot.createdAt.toLocaleString("cs-CZ")}</span>{snapshot.sourceNote && <span>Poznámka ke zdroji: {snapshot.sourceNote}</span>}</div>
    {editable && <div className="quarterly-snapshot-actions"><form className="compact-form" action={`${baseAction}/snapshot`} method="post"><label className="field"><span>Uložený kompatibilní snapshot</span><select name="snapshotId" defaultValue={snapshot.id}>{candidates.map((candidate) => <option value={candidate.id} key={candidate.id}>Revize {candidate.revision} · {candidate.source} · {candidate.createdAt.toLocaleString("cs-CZ")}</option>)}</select></label><button className="secondary" type="submit">Použít snapshot</button></form><form action={`${baseAction}/recalculate`} method="post"><button className="secondary" type="submit">Přepočítat snapshot</button></form></div>}
  </div></details>;
}
