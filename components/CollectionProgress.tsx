/** Missing prescriptions are not a successful 100% collection. */
export function CollectionProgress({ expected, paid }: { expected: number; paid: number }) {
  if (expected <= 0) return <span className="collection-empty" title="Pro toto období není předpis">—<small>Bez předpisu</small></span>;
  const percent = Math.max(0, Math.round(paid / expected * 100));
  const tone = percent >= 100 ? "complete" : percent > 0 ? "partial" : "unpaid";
  return <span className={`collection-indicator ${tone}`}><span>{percent} %</span><span className="collection-track" role="progressbar" aria-label="Inkaso" aria-valuenow={Math.min(percent, 100)} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${percent} % uhrazeno`}><i style={{ width: `${Math.min(percent, 100)}%` }}/></span></span>;
}
