import pg from "pg";

const { Pool } = pg;

export type DbPool = InstanceType<typeof Pool>;

export function createPool(connectionString: string): DbPool {
  return new Pool({ connectionString });
}

// ---------------------------------------------------------------------------
// Upsert helpers
// ---------------------------------------------------------------------------

export interface OwnerRow {
  owner_id: string;
  owner_name: string;
  email: string | null;
}

export async function upsertOwner(pool: DbPool, row: OwnerRow): Promise<void> {
  await pool.query(
    `INSERT INTO owners (owner_id, owner_name, email, synced_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (owner_id) DO UPDATE SET
       owner_name = EXCLUDED.owner_name,
       email      = EXCLUDED.email,
       synced_at  = now()`,
    [row.owner_id, row.owner_name, row.email]
  );
}

export interface CompanyRow {
  hubspot_company_id: string;
  company_name: string | null;
  owner_id: string | null;
  owner_name: string | null;
  credits_package: string | null;
  account_status: string | null;
  hs_updated_at: Date | null;
}

export async function upsertCompany(pool: DbPool, row: CompanyRow): Promise<void> {
  await upsertCompanies(pool, [row]);
}

export async function upsertCompanies(pool: DbPool, rows: CompanyRow[]): Promise<void> {
  if (rows.length === 0) return;
  const values: unknown[] = [];
  const placeholders = rows.map((row, i) => {
    const base = i * 7;
    values.push(
      row.hubspot_company_id,
      row.company_name,
      null, // owner_id omitted — owners scope not available; owner_name used instead
      row.owner_name,
      row.credits_package,
      row.account_status,
      row.hs_updated_at
    );
    return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},now())`;
  });
  await pool.query(
    `INSERT INTO companies
       (hubspot_company_id, company_name, owner_id, owner_name,
        credits_package, account_status, hs_updated_at, synced_at)
     VALUES ${placeholders.join(",")}
     ON CONFLICT (hubspot_company_id) DO UPDATE SET
       company_name    = EXCLUDED.company_name,
       owner_id        = EXCLUDED.owner_id,
       owner_name      = EXCLUDED.owner_name,
       credits_package = EXCLUDED.credits_package,
       account_status  = EXCLUDED.account_status,
       hs_updated_at   = EXCLUDED.hs_updated_at,
       synced_at       = now()`,
    values
  );
}

export interface EngagementRow {
  hubspot_engagement_id: string;
  hubspot_company_id: string;
  engagement_type: string | null;
  occurred_at: Date | null;
  hs_updated_at: Date | null;
}

export async function upsertEngagement(
  pool: DbPool,
  row: EngagementRow
): Promise<void> {
  await upsertEngagements(pool, [row]);
}

export async function upsertEngagements(pool: DbPool, rows: EngagementRow[]): Promise<void> {
  if (rows.length === 0) return;
  // Deduplicate by primary key within the batch — Postgres rejects duplicate
  // keys in a single ON CONFLICT statement.
  const seen = new Set<string>();
  const deduped = rows.filter((r) => {
    if (seen.has(r.hubspot_engagement_id)) return false;
    seen.add(r.hubspot_engagement_id);
    return true;
  });
  const values: unknown[] = [];
  const placeholders = deduped.map((row, i) => {
    const base = i * 5;
    values.push(
      row.hubspot_engagement_id,
      row.hubspot_company_id,
      row.engagement_type,
      row.occurred_at,
      row.hs_updated_at
    );
    return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},now())`;
  });
  await pool.query(
    `INSERT INTO engagements
       (hubspot_engagement_id, hubspot_company_id, engagement_type,
        occurred_at, hs_updated_at, synced_at)
     VALUES ${placeholders.join(",")}
     ON CONFLICT (hubspot_engagement_id) DO UPDATE SET
       hubspot_company_id = EXCLUDED.hubspot_company_id,
       engagement_type    = EXCLUDED.engagement_type,
       occurred_at        = EXCLUDED.occurred_at,
       hs_updated_at      = EXCLUDED.hs_updated_at,
       synced_at          = now()`,
    values
  );
}

export interface DealRow {
  hubspot_deal_id: string;
  hubspot_company_id: string | null;
  deal_stage: string | null;
  closedate: Date | null;
  amount: number | null;
  hs_updated_at: Date | null;
}

export async function upsertDeal(pool: DbPool, row: DealRow): Promise<void> {
  await upsertDeals(pool, [row]);
}

export async function upsertDeals(pool: DbPool, rows: DealRow[]): Promise<void> {
  if (rows.length === 0) return;
  const values: unknown[] = [];
  const placeholders = rows.map((row, i) => {
    const base = i * 6;
    values.push(
      row.hubspot_deal_id,
      row.hubspot_company_id,
      row.deal_stage,
      row.closedate,
      row.amount,
      row.hs_updated_at
    );
    return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},now())`;
  });
  await pool.query(
    `INSERT INTO deals
       (hubspot_deal_id, hubspot_company_id, deal_stage,
        closedate, amount, hs_updated_at, synced_at)
     VALUES ${placeholders.join(",")}
     ON CONFLICT (hubspot_deal_id) DO UPDATE SET
       hubspot_company_id = EXCLUDED.hubspot_company_id,
       deal_stage         = EXCLUDED.deal_stage,
       closedate          = EXCLUDED.closedate,
       amount             = EXCLUDED.amount,
       hs_updated_at      = EXCLUDED.hs_updated_at,
       synced_at          = now()`,
    values
  );
}

// ---------------------------------------------------------------------------
// Sync state (for incremental sync)
// ---------------------------------------------------------------------------

export async function getSyncState(
  pool: DbPool,
  entity: string
): Promise<Date> {
  const result = await pool.query<{ last_synced: Date }>(
    "SELECT last_synced FROM sync_state WHERE entity = $1",
    [entity]
  );
  return result.rows[0]?.last_synced ?? new Date(0);
}

export async function setSyncState(
  pool: DbPool,
  entity: string,
  lastSynced: Date
): Promise<void> {
  await pool.query(
    `INSERT INTO sync_state (entity, last_synced) VALUES ($1, $2)
     ON CONFLICT (entity) DO UPDATE SET last_synced = EXCLUDED.last_synced`,
    [entity, lastSynced]
  );
}
