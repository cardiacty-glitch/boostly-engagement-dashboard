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
  upsertCompanies,
  upsertEngagements,
  upsertDeals,
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

    // Step 2: Owners — skipped (crm.objects.owners.read scope not granted).
    // owner_name is stored directly on companies so filtering still works.
    console.log("[sync] Step 2: Skipping owners (scope not available).");

    // Step 3: Companies
    console.log("[sync] Step 3: Syncing companies...");
    const companiesLastSynced = full ? new Date(0) : await getSyncState(pool, "companies");
    let companyCount = 0;
    const companiesBatchStart = new Date();
    const COMPANY_BATCH = 500;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const companyBuf: any[] = [];
    for await (const company of fetchAllCompanies(
      hubspot, creditsPackageKey, accountStatusKey, companiesLastSynced
    )) {
      companyBuf.push(company);
      if (companyBuf.length >= COMPANY_BATCH) {
        await upsertCompanies(pool, companyBuf);
        companyCount += companyBuf.length;
        console.log(`[sync] Companies progress: ${companyCount}`);
        companyBuf.length = 0;
      }
    }
    if (companyBuf.length > 0) {
      await upsertCompanies(pool, companyBuf);
      companyCount += companyBuf.length;
    }
    console.log(`[sync] Companies: ${companyCount}`);
    await setSyncState(pool, "companies", companiesBatchStart);

    // Step 4: Engagements
    console.log("[sync] Step 4: Syncing engagements...");
    // For a full sync we only need 90 days — that is all the dashboard uses.
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const engagementsLastSynced = full ? ninetyDaysAgo : await getSyncState(pool, "engagements");
    let engagementCount = 0;
    let engSkipped = 0;
    const engBatchStart = new Date();
    const ENGAGEMENT_BATCH = 500;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const engBuf: any[] = [];
    for await (const engagement of fetchAllEngagements(hubspot, engagementsLastSynced)) {
      engBuf.push(engagement);
      if (engBuf.length >= ENGAGEMENT_BATCH) {
        try {
          await upsertEngagements(pool, engBuf);
          engagementCount += engBuf.length;
        } catch (err: unknown) {
          if (isFKViolation(err)) { engSkipped += engBuf.length; } else { throw err; }
        }
        engBuf.length = 0;
      }
    }
    if (engBuf.length > 0) {
      try {
        await upsertEngagements(pool, engBuf);
        engagementCount += engBuf.length;
      } catch (err: unknown) {
        if (isFKViolation(err)) { engSkipped += engBuf.length; } else { throw err; }
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
    const DEAL_BATCH = 500;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dealBuf: any[] = [];
    for await (const deal of fetchAllClosedWonDeals(hubspot, dealsLastSynced)) {
      dealBuf.push(deal);
      if (dealBuf.length >= DEAL_BATCH) {
        try {
          await upsertDeals(pool, dealBuf);
          dealCount += dealBuf.length;
        } catch (err: unknown) {
          if (isFKViolation(err)) { dealSkipped += dealBuf.length; } else { throw err; }
        }
        dealBuf.length = 0;
      }
    }
    if (dealBuf.length > 0) {
      try {
        await upsertDeals(pool, dealBuf);
        dealCount += dealBuf.length;
      } catch (err: unknown) {
        if (isFKViolation(err)) { dealSkipped += dealBuf.length; } else { throw err; }
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
