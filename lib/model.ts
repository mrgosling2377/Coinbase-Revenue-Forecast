import data from './workbook-data.json' with { type: 'json' };
export { data };
export type ModelData = typeof data;
export type Scenario = 'Bear' | 'Base' | 'Bull';
export type Inputs = Record<string, number>;
export type Cases = Record<Scenario, Inputs[]>;
export const scenarios: Scenario[] = ['Bear', 'Base', 'Bull'];
export const caseNames = { Bear: 'Worst Case', Base: 'Base Case', Bull: 'Best Case' };
export const original = (source: ModelData = data): Cases => structuredClone(source.defaults);
export function calculate(inputs: Inputs[], source: ModelData = data) {
  const h = source.history[5];
  let prior = { ...h, takeRate: h.consumer / 1000000 / h.volume, stableRate: h.stablecoin / 1000000 / h.usdc };
  return inputs.map((a, i) => {
    const volume = prior.volume * (1 + a.volumeGrowth);
    const takeRate = prior.takeRate + a.takeRateBps / 10000;
    const consumer = volume * takeRate * 1000000;
    const institutional = prior.institutional * (1 + a.institutionalGrowth);
    const otherTransaction = prior.otherTransaction * (1 + a.otherTransactionGrowth);
    const usdc = prior.usdc * (1 + a.usdcGrowth);
    const stableRate = prior.stableRate + a.stableRateBps / 10000;
    const stablecoin = usdc * (stableRate * 1000000);
    const rewards = prior.rewards * (1 + a.cryptoGrowth);
    const finance = prior.finance * (1 + a.financeGrowth);
    const otherServices = prior.otherServices * (1 + a.otherServicesGrowth);
    const corporate = prior.corporate * (1 + a.corporateGrowth);
    const transaction = consumer + institutional + otherTransaction;
    const services = stablecoin + rewards + finance + otherServices;
    const net = transaction + services;
    prior = { quarter: `Q${i + 3} 2026`, volume, takeRate, consumer, institutional, otherTransaction, usdc, stableRate, stablecoin, rewards, finance, otherServices, corporate, transaction, services, net, total: net + corporate };
    return prior;
  });
}
export function updateInput(cases: Cases, scenario: Scenario, quarter: number, key: string, value: number): Cases {
  if (![0, 1].includes(quarter) || !Number.isFinite(value)) throw new Error('Enter a finite number and a valid quarter.');
  const definition = data.definitions.find(d => d.key === key);
  if (!definition) throw new Error('Unknown assumption.');
  const next = structuredClone(cases);
  (definition.scenario ? [scenario] : scenarios).forEach(s => { next[s][quarter][key] = value; });
  return next;
}
export const money = (v: number) => Math.abs(v) >= 1000000 ? `$${(v / 1000000).toFixed(3)}B` : `$${(v / 1000).toFixed(1)}M`;
export const millions = (v: number) => (v / 1000).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
