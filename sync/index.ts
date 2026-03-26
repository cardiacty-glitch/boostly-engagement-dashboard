/**
 * CLI entry-point for the sync script.
 *
 * Usage:
 *   npm run sync          # incremental
 *   npm run sync:full     # full re-sync
 *
 * Cron example (nightly at 2 AM Mountain / 8 AM UTC):
 *   0 8 * * * cd /path/to/engagement-dashboard && npm run sync >> /var/log/sync.log 2>&1
 */

import "dotenv/config";
import { runSync } from "./runner";

const full = process.argv.includes("--full");

runSync({ full }).catch((err) => {
  console.error("[sync] Fatal error:", err);
  process.exit(1);
});
