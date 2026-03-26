/**
 * Core sync logic, extracted so it can be imported by both:
 *  - sync/index.ts  (CLI, runs with tsx)
 *  - app/api/sync/route.ts  (Vercel API route)
 */

import { Client } from "@hubspot/api-client";
import {
  createPool,
  getSyncState,
  setSyncState,
  upsertOwner,
  upsertCompany,
  upsertEngagement,
  upsertDeal,
} from "./db";
import {
  resolvePropertyKeys,
  fetchOwners,
  fetchAllCompanies,
  fetchAllEngagements,
  fetchAllClosedWonDeals,
} from "./hubspot";

export interface SyncOptions {
  full?: boolean;
}

export async function runSync(options: SyncOptions = {}): Promise<void> {
  const { full = false } = options;

  const connectionString = process.env.DATABASE_URL;
  const accessToken = process.env.HUBSPOT_ACCESS_TOKEN;

  if (!connectionString) throw new Error("DATABASE_URL is not set");
  if (!accessToken) throw new Error("HUBSPOT_ACCESS_TOKEN is not set");

  const startedAt = new Date();
  console.log(`[sync] Starting ${full ? "FULL" : "incremental"} sync at ${startedAt.toISOString()}`);

  const pool = createPool(connectionString);
  const hubspot = new Client({ accessToken });

  try {
    // Step 1: Resolve property keys
    console.log("[sync] Step 1: Resolving property keys...");
    const { creditsPackageKey, accountStatusKey } = await resolvePropertyKeys(hubspot);

    // Step 2: Owners
    console.log("[sync] Step 2: Syncing owners...");
    const owners = await fetchOwners(hubspot);
    for (const owner of owners) {
      await upsertOwner(pool, owner);
    }
    console.log(`[sync] Owners: ${owners.length}`);

    // Step 3: Companies
    console.log("[sync] Step 3: Syncing companies...");
    const companiesLastSynced = full ? new Date(0) : await getSyncState(pool, "companies");
    let companyCount = 0;
    const companiesBatchStart = new Date();
    for await (const company of fetchAllCompanies(
      hubspot, creditsPackageKey, accountStatusKey, companiesLastSynced
    )) {
      await upsertCompany(pool, company);
      companyCount++;
    }
    console.log(`[sync] Companies: ${companyCount}`);
    await setSyncState(pool, "companies", companiesBatchStart);

    // Step 4: Engagements
    console.log("[sync] Step 4: Syncing engagements...");
    const engagementsLastSynced = full ? new Date(0) : await getSyncState(pool, "engagements");
    let engagementCount = 0;
    let engSkipped = 0;
    const engBatchStart = new Date();
    for await (const engagement of fetchAllEngagements(hubspot, engagementsLastSynced)) {
      try {
        await upsertEngagement(pool, engagement);
        engagementCount++;
      } catch (err: unknown) {
        if (isFKViolation(err)) { engSkipped++; } else { throw err; }
      }
    }
    console.log(`[sync] Engagements: ${engagementCount} (skipped ${engSkipped})`);
    await setSyncState(pool, "engagements", engBatchStart);

    // Step 5: Deals
    console.log("[sync] Step 5: Syncing Closed Won deals...");
    const dealsLastSynced = full ? new Date(0) : await getSyncState(pool, "deals");
    let dealCount = 0;
    let dealSkipped = 0;
    const dealsBatchStart = new Date();
    for await (const deal of fetchAllClosedWonDeals(hubspot, dealsLastSynced)) {
      try {
        await upsertDeal(pool, deal);
        dealCount++;
      } catch (err: unknown) {
        if (isFKViolation(err)) { dealSkipped++; } else { throw err; }
      }
    }
    console.log(`[sync] Deals: ${dealCount} (skipped ${dealSkipped})`);
    await setSyncState(pool, "deals", dealsBatchStart);

    const elapsed = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);
    console.log(`[sync] Done in ${elapsed}s`);
  } finally {
    await pool.end();
  }
}

function isFKViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23503"
  );
}
