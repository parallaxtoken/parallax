// Re-runs the discovery set in dependency order (recorder and the log scan are long-running and excluded).
import { spawnSync } from 'node:child_process';
const steps = ['e1_wrapper_map', 'e1_rwa_list', 'e2_unit_factors', 'e3_reference_and_units', 'e11_pools', 'e5_depth_curves', 'e7_contract_receive', 'e9_geo_latency', 'e4_backfill', 'e12_broken_quotes', 'summary', 'render_discovery'];
for (const s of steps) {
  console.log(`\n== ${s}`);
  const r = spawnSync(process.execPath, [`scripts/discovery/${s}.mjs`], { stdio: 'inherit' });
  if (r.status !== 0) { console.error(`step ${s} failed`); process.exit(r.status ?? 1); }
}
