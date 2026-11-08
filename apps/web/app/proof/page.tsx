import { readText, discovery } from '@/lib/server/data';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Proof' };

interface Claim { id: string; claim: string; status: 'SUPPORTED' | 'PARTIAL' | 'UNMEASURED' | 'NOT_CLAIMED'; reproduce: string; evidence: string[]; limitations: string }

const INVARIANTS: [string, string, string][] = [
  ['T1', 'Unit normalisation', 'packages/kernel/test, contracts ParallaxBook._fillBuy, contracts/soroban ParallaxBook.fill'],
  ['T2', 'Share floor (buy)', 'test_shareFloorRevert, invariant_floorAndExactlyOnce'],
  ['T2b', 'Sell floor', 'test_sellFloorRevert'],
  ['T3', 'Live unit', 'test_keeperCannotPassUnit'],
  ['T4', 'Corporate-action freeze', 'test_corporatePauseBStock, test_corporatePauseOndoOracle'],
  ['T5', 'Allowlist', 'test_unlistedRouter, test_wrongWrapper'],
  ['T6', 'No custody', 'testFuzz_noResidual, invariant_bookHoldsNothing'],
  ['T7', 'Recipient lock', 'test_maliciousRecipient'],
  ['T8', 'Exactly once', 'test_replay'],
  ['T9', 'Simulate before send', 'services/keeper journal'],
  ['T10', 'Stale is labelled', 'packages/kernel/test (T10)'],
  ['T11', 'Decomposition closure', 'packages/kernel/test, packages/verify/test'],
  ['T12', 'Degraded is distinct', 'packages/binance/test, packages/kernel/test'],
];

const TONE: Record<Claim['status'], string> = { SUPPORTED: 'bg-net/20 text-net', PARTIAL: 'bg-session/30', UNMEASURED: 'bg-paper-2 text-graphite', NOT_CLAIMED: 'bg-paper-2 text-graphite' };

export default async function ProofPage() {
  const [claimsRaw, forge, d] = await Promise.all([readText('docs/CLAIMS.json'), readText('evidence/fork/forge_test_full.txt'), discovery()]);
  const claims: Claim[] = claimsRaw ? (JSON.parse(claimsRaw) as { claims: Claim[] }).claims : [];
  const suite = forge ? [...forge.matchAll(/(\d+) tests passed, (\d+) failed/g)].pop() : null;
  return (
    <div className="mx-auto w-[min(1180px,calc(100%-24px))] py-10">
      <h1 className="h2">Proof</h1>
      <p className="mt-3 max-w-2xl text-graphite">Every claim, the command that reproduces it, the file that holds the evidence, and what it does not show. A claim without evidence says so.</p>

      <section className="mt-8 rounded-[var(--radius-card)] border border-rule bg-paper-3 p-5">
        <h2 className="font-display text-xl font-semibold">Fork suite</h2>
        <p className="mt-2">{suite ? <><span className="num font-medium">{suite[1]}</span> passed, <span className="num font-medium">{suite[2]}</span> failed on a BSC mainnet fork. Log: <code className="font-mono text-xs">evidence/fork/forge_test_full.txt</code>.</> : 'The fork suite log is not present in this deployment.'}</p>
        {d ? <p className="mt-1 text-sm text-graphite">Discovery snapshot covers {d.wrappers} wrappers over {d.tickers} tickers; recorder cycles at snapshot: {d.brokenQuotes.cycles}.</p> : null}
      </section>

      <section className="mt-6" aria-labelledby="claims">
        <h2 id="claims" className="font-display text-xl font-semibold">Claims ledger</h2>
        <ul className="mt-4 grid gap-3">
          {claims.map((c) => (
            <li key={c.id} className="rounded-[var(--radius-card)] border border-rule bg-paper-3 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-xs text-graphite">{c.id}</span>
                <span className={`rounded-full px-3 py-0.5 font-mono text-xs ${TONE[c.status]}`}>{c.status}</span>
              </div>
              <p className="mt-2 font-medium">{c.claim}</p>
              <p className="mt-2 font-mono text-xs text-graphite">$ {c.reproduce}</p>
              {c.evidence.length ? <p className="mt-1 font-mono text-xs text-graphite">evidence: {c.evidence.join(', ')}</p> : null}
              <p className="mt-2 text-sm text-graphite">Limits: {c.limitations}</p>
            </li>
          ))}
          {claims.length === 0 ? <li className="rounded-[14px] bg-paper-2 p-4">The claims ledger could not be read.</li> : null}
        </ul>
      </section>

      <section className="mt-8" aria-labelledby="inv">
        <h2 id="inv" className="font-display text-xl font-semibold">Invariants and where each is checked</h2>
        <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Invariants table">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="text-left font-mono text-xs text-graphite"><th className="py-2">ID</th><th>Invariant</th><th>Checked by</th></tr></thead>
            <tbody>
              {INVARIANTS.map(([id, n, w]) => (
                <tr key={id} className="border-t border-rule"><td className="py-2 font-mono text-unit">{id}</td><td>{n}</td><td className="font-mono text-xs text-graphite">{w}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
