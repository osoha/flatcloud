import { businessDateKey } from '../calendar';
export const FORECAST_QA_TAG = 'R24_AGENT_QA_2026_09';
export const FORECAST_QA_PROPERTY_ID = 'r27b_forecast_test_house';
export const FORECAST_QA_OWNER_ID = 'r27b_forecast_test_owner';
/** Fixed at first creation; subsequent runs must never move existing expirations. */
export function forecastTestHouse(asOf: Date) {
  const [year, month] = businessDateKey(asOf).split('-').map(Number);
  const start = (offset: number) => new Date(Date.UTC(year, month - 1 + offset, 1, 12));
  const end = (offset: number) => new Date(Date.UTC(year, month - 1 + offset, 0, 12));
  const definitions = [
    { duration: 12, elapsed: 11, rate: 0 }, { duration: 12, elapsed: 10, rate: 0 },
    { duration: 12, elapsed: 9, rate: 0 }, { duration: 12, elapsed: 8, rate: 0 },
    { duration: 12, elapsed: 6, rate: 0 }, { duration: 12, elapsed: 4, rate: 0 },
    { duration: 12, elapsed: 2, rate: 0 }, { duration: 12, elapsed: 0, rate: 0 },
    { duration: 24, elapsed: 0, rate: 0 }, { duration: 36, elapsed: 0, rate: 200 },
    { duration: null, elapsed: 0, rate: 0 }, { duration: null, elapsed: 0, rate: 300 },
  ];
  return definitions.map((row, index) => ({
    id: `r27b_forecast_${index + 1}`, label: `V${String(index + 1).padStart(2,'0')}`,
    durationMonths: row.duration, startDate: start(-row.elapsed),
    endDate: row.duration === null ? null : end(row.duration - row.elapsed),
    rentCents: (10000 + index * 500) * 100, servicesCents: 250000,
    indexationPercentBps: row.rate || null,
    nextIndexationAt: row.rate ? start(12) : null,
  }));
}
export function requireForecastSeedTarget(env: Record<string, string | undefined>) {
  if (env.FORECAST_QA_CONFIRM !== FORECAST_QA_TAG) throw new Error('Vyžadováno výslovné FORECAST_QA_CONFIRM.');
  const host = new URL(env.DATABASE_URL || '').hostname;
  const local = ['localhost','127.0.0.1','postgres'].includes(host);
  const sandbox = env.RENDER_SERVICE_ID === 'srv-dacselkmqu1s73bmjoq0' && env.RENDER_GIT_BRANCH === 'sandbox/ux-agent';
  if (!local && !sandbox) throw new Error('Seed je povolen jen v izolované lokální/CI DB nebo určené Render sandbox službě.');
}
