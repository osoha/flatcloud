import { SOURCE_SERVICES, sourceMoney, type SourcePayload } from './settlement-source-rules';

export type ConfirmedSourceInput = {
  id: string; identityKey: string; version: number; confirmedAt: Date | null;
  payload: SourcePayload;
};
export type SettlementEvidenceRow = {
  id: string; sourceId: string; version: number; lineKey: string; service: string;
  title: string; from: string; to: string; amountCents: number;
  allocationLabel: string; confirmedAt: string;
  components: { base: string; consumption: string; correction: string; rounding: string; complete: boolean };
};
type LeaseInterval = { id: string; from: string; to: string | null };
const overlaps = (a: string, b: string, c: string, d: string) => a <= d && c <= b;

/** No implicit proration: a source line must already describe this lease's cost.
 * A unit-only line is usable only if a single lease covers the entire line period.
 * House totals, intermediate summaries and thermal invoices are never allocations.
 */
export function projectSettlementCosts(sources: ConfirmedSourceInput[], input: {
  leaseId: string; unitId: string; from: string; to: string; leases: LeaseInterval[];
  allocations?: Array<{sourceId:string;lineKey:string;unitId:string;leaseId:string|null;amountCents:number;label:string}>;
}) {
  const rows: SettlementEvidenceRow[] = [], blockers: string[] = [], warnings: string[] = [];
  const replacedCostIds = new Set<string>();
  const latest = new Map<string, ConfirmedSourceInput>();
  for (const source of sources) {
    if (!source.confirmedAt) continue;
    // Retain all historic links: changing an invoice link in a revision must not
    // resurrect the old accounting cost alongside the replacement source.
    if (source.payload.propertyCostId) replacedCostIds.add(source.payload.propertyCostId);
    if ((latest.get(source.identityKey)?.version ?? 0) < source.version) latest.set(source.identityKey, source);
  }
  for (const source of latest.values()) {
    const p = source.payload;
    let relevant = false;
    for (const line of p.lines) {
      if (line.role !== 'COST' || !overlaps(line.from, line.to, input.from, input.to)) continue;
      if (line.unitId && line.unitId !== input.unitId) continue;
      if (line.leaseId && line.leaseId !== input.leaseId) continue;
      relevant = true;
      const service = SOURCE_SERVICES.find(s => s[0] === line.service)!;
      if (service[2] === 'OWNER' && !line.ownerOverride) continue;
      if (service[2] === 'REVIEW' && !line.ownerOverride) {
        blockers.push(`${service[1]}: čeká na individuální posouzení.`); continue;
      }
      if (service[2] === 'EXTERNAL' && p.kind !== 'EXTERNAL') {
        blockers.push(`${service[1]}: čeká na externí rozúčtování; faktura ani ruční odečet nejsou výsledkem rozúčtování.`); continue;
      }
      if (!line.unitId) {
        const allocation=input.allocations?.find(a=>a.sourceId===source.id&&a.lineKey===line.key&&a.unitId===input.unitId&&(!a.leaseId||a.leaseId===input.leaseId));
        if(!allocation){blockers.push(`${service[1]}: domovní náklad nemá potvrzené rozdělení na jednotky a nájemní vztahy.`);continue;}
        rows.push({id:`${source.id}:${line.key}:allocation`,sourceId:source.id,version:source.version,lineKey:line.key,service:line.service,title:`${service[1]} · ${p.reference}`,from:line.from,to:line.to,amountCents:allocation.amountCents,confirmedAt:source.confirmedAt!.toISOString(),allocationLabel:allocation.label,components:{base:'',consumption:'',correction:'',rounding:'',complete:false}});
        continue;
      }
      if (line.from < input.from || line.to > input.to) {
        blockers.push(`${service[1]}: řádek přesahuje vybrané období; vyžaduje doložené rozdělení.`); continue;
      }
      const lease = input.leases.find(l => l.id === input.leaseId);
      if (!lease || lease.from > line.from || (lease.to && lease.to < line.to)) {
        blockers.push(`${service[1]}: náklad není celý uvnitř platnosti smlouvy.`); continue;
      }
      if (!line.leaseId && input.leases.some(l => l.id !== input.leaseId && overlaps(l.from, l.to ?? '9999-12-31', line.from, line.to))) {
        blockers.push(`${service[1]}: jednotka má v období další smlouvu; potvrďte náklad konkrétního nájemního vztahu.`); continue;
      }
      if (line.ownerOverride) warnings.push(`${service[1]}: ruční zahrnutí s odůvodněním „${line.ownerReason}“. Potvrzení nemění právní přípustnost položky.`);
      rows.push({
        id: `${source.id}:${line.key}`, sourceId: source.id, version: source.version, lineKey: line.key,
        service: line.service, title: `${service[1]} · ${p.reference}`, from: line.from, to: line.to,
        amountCents: sourceMoney(line.amount), confirmedAt: source.confirmedAt!.toISOString(),
        allocationLabel: line.leaseId ? 'Potvrzený náklad smlouvy' : 'Potvrzený náklad jednotky · jediná smlouva v celém období',
        components: { base: line.base, consumption: line.consumptionComponent, correction: line.correction, rounding: line.rounding, complete: line.componentsComplete },
      });
    }
    if (relevant && sources.some(s => s.identityKey === source.identityKey && s.version > source.version && !s.confirmedAt)) {
      blockers.push('Existuje nepotvrzená oprava podkladu. Zatím je použita poslední potvrzená verze; před dokončením opravu zkontrolujte.');
    }
  }
  return { rows, blockers: [...new Set(blockers)], warnings: [...new Set(warnings)], replacedCostIds };
}
