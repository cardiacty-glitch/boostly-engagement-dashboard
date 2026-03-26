import { Pool } from "pg";

// ---------------------------------------------------------------------------
// Serverless-safe Postgres pool.
// Vercel caches module scope across warm invocations, so we use a global to
// reuse the same pool rather than creating a new one on every request.
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

function getPool(): Pool {
  if (!globalThis._pgPool) {
    globalThis._pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return globalThis._pgPool;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OwnerRow {
  owner_id: string;
  owner_name: string;
  company_count: number;
  avg_ease_score: number;
  avg_contact_frequency_90d: number;
  total_contact_frequency_90d: number;
  companies_with_spend_data: number;
}

export interface CompanyRow {
  hubspot_company_id: string;
  company_name: string;
  owner_id: string | null;
  owner_name: string | null;
  account_status: string | null;
  credits_package: string | null;
  contact_frequency_90d: number;
  spend: string | null;
  spend_source: string | null;
  spend_numeric: number | null;
  last_engagement_at: string | null;
  days_since_last_engagement: number | null;
  ease_score_0_to_100: number;
}

export interface EngagementTypeRow {
  engagement_type: string;
  count: number;
}

export interface RecentEngagementRow {
  engagement_type: string;
  occurred_at: string;
}

export interface LatestDealRow {
  amount: number;
  closedate: string;
}

export interface CompanyDetail {
  metrics: CompanyRow | null;
  engagementTypes: EngagementTypeRow[];
  recentEngagements: RecentEngagementRow[];
  latestDeal: LatestDealRow | null;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getOwnerLeaderboard(): Promise<OwnerRow[]> {
  const { rows } = await getPool().query<OwnerRow>(`
    SELECT
      owner_id,
      owner_name,
      company_count,
      avg_ease_score,
      avg_contact_frequency_90d,
      total_contact_frequency_90d,
      companies_with_spend_data
    FROM owner_leaderboard
    ORDER BY avg_ease_score DESC
  `);
  return rows;
}

export async function getCompanyMetrics(ownerName?: string): Promise<CompanyRow[]> {
  const pool = getPool();
  if (ownerName) {
    const { rows } = await pool.query<CompanyRow>(
      `SELECT
         hubspot_company_id, company_name, owner_id, owner_name,
         account_status, credits_package, contact_frequency_90d,
         spend, spend_source, spend_numeric,
         last_engagement_at, days_since_last_engagement, ease_score_0_to_100
       FROM company_metrics
       WHERE owner_name = $1
       ORDER BY ease_score_0_to_100 DESC`,
      [ownerName]
    );
    return rows;
  }

  const { rows } = await pool.query<CompanyRow>(`
    SELECT
      hubspot_company_id, company_name, owner_id, owner_name,
      account_status, credits_package, contact_frequency_90d,
      spend, spend_source, spend_numeric,
      last_engagement_at, days_since_last_engagement, ease_score_0_to_100
    FROM company_metrics
    ORDER BY ease_score_0_to_100 DESC
  `);
  return rows;
}

export async function getCompanyDetail(companyId: string): Promise<CompanyDetail> {
  const pool = getPool();

  const [metricsRes, typesRes, recentRes, dealRes] = await Promise.all([
    pool.query<CompanyRow>(
      `SELECT
         hubspot_company_id, company_name, owner_id, owner_name,
         account_status, credits_package, contact_frequency_90d,
         spend, spend_source, spend_numeric,
         last_engagement_at, days_since_last_engagement,
         recency_score, frequency_score, ease_score_0_to_100
       FROM company_metrics
       WHERE hubspot_company_id = $1`,
      [companyId]
    ),
    pool.query<EngagementTypeRow>(
      `SELECT engagement_type, COUNT(*)::int AS count
       FROM engagements
       WHERE hubspot_company_id = $1
         AND occurred_at >= now() - interval '90 days'
       GROUP BY engagement_type
       ORDER BY count DESC`,
      [companyId]
    ),
    pool.query<RecentEngagementRow>(
      `SELECT engagement_type, occurred_at
       FROM engagements
       WHERE hubspot_company_id = $1
       ORDER BY occurred_at DESC
       LIMIT 10`,
      [companyId]
    ),
    pool.query<LatestDealRow>(
      `SELECT amount, closedate
       FROM latest_closed_won_deal
       WHERE hubspot_company_id = $1`,
      [companyId]
    ),
  ]);

  return {
    metrics: metricsRes.rows[0] ?? null,
    engagementTypes: typesRes.rows,
    recentEngagements: recentRes.rows,
    latestDeal: dealRes.rows[0] ?? null,
  };
}
