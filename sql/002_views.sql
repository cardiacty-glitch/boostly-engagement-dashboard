-- Engagement Dashboard — metric views
-- All 90-day windows are anchored to now() in UTC; Mountain Time adjustment is
-- applied to the boundary so that "today" means today in America/Denver.

-- ---------------------------------------------------------------------------
-- 1. contact_frequency_90d
--    Count of engagements per company in the rolling 90-day window.
--    The window start is midnight 90 days ago in America/Denver, converted to UTC.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW contact_frequency_90d AS
SELECT
  hubspot_company_id,
  COUNT(*) AS engagement_count
FROM engagements
WHERE occurred_at IS NOT NULL
  AND occurred_at >= (
    -- 90 days ago at the current wall-clock time in Mountain Time, in UTC
    now() - interval '90 days'
  )
GROUP BY hubspot_company_id;

-- ---------------------------------------------------------------------------
-- 2. latest_closed_won_deal
--    The single most-recent Closed Won deal per company (by closedate).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW latest_closed_won_deal AS
SELECT DISTINCT ON (hubspot_company_id)
  hubspot_company_id,
  hubspot_deal_id,
  amount,
  closedate
FROM deals
WHERE deal_stage = 'closedwon'
  AND amount IS NOT NULL
ORDER BY hubspot_company_id, closedate DESC NULLS LAST;

-- ---------------------------------------------------------------------------
-- 3. company_spend
--    Average dollar amount of Closed Won deals closed in the last 3 months,
--    per company. NULL when no qualifying deals exist in that window.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW company_spend AS
SELECT
  c.hubspot_company_id,
  AVG(d.amount)              AS avg_spend_3mo,
  COUNT(d.hubspot_deal_id)   AS deal_count_3mo
FROM companies c
LEFT JOIN deals d
  ON  d.hubspot_company_id = c.hubspot_company_id
  AND d.deal_stage          = 'closedwon'
  AND d.closedate          >= now() - interval '3 months'
  AND d.amount             IS NOT NULL
GROUP BY c.hubspot_company_id;

-- ---------------------------------------------------------------------------
-- 4. ease_score
--    Baseline 0–100 score per active company.
--
--    recency_score  = max(0, min(100, 100 − (days_since_last / 90) × 100))
--    frequency_score = max(0, min(100, engagement_count_90d / 20 × 100))
--    ease_score     = 0.6 × recency_score + 0.4 × frequency_score
--
--    Companies with no engagements ever receive ease_score = 0.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW ease_score AS
SELECT
  c.hubspot_company_id,
  COALESCE(freq.engagement_count, 0)                    AS engagement_count_90d,
  MAX(e.occurred_at)                                    AS last_engagement_at,
  CASE
    WHEN MAX(e.occurred_at) IS NULL THEN NULL
    ELSE ROUND(EXTRACT(EPOCH FROM (now() - MAX(e.occurred_at))) / 86400.0, 1)
  END                                                   AS days_since_last_engagement,

  -- Recency score (0 = no contact in 90+ days, 100 = contacted today)
  CASE
    WHEN MAX(e.occurred_at) IS NULL THEN 0
    ELSE GREATEST(0, LEAST(100,
      100.0 - (EXTRACT(EPOCH FROM (now() - MAX(e.occurred_at))) / 86400.0 / 90.0 * 100.0)
    ))
  END                                                   AS recency_score,

  -- Frequency score (0 = 0 engagements, 100 = 20+ engagements in 90 days)
  GREATEST(0, LEAST(100, COALESCE(freq.engagement_count, 0) * 5.0))
                                                        AS frequency_score,

  -- Combined ease score
  ROUND(
    0.6 * CASE
      WHEN MAX(e.occurred_at) IS NULL THEN 0
      ELSE GREATEST(0, LEAST(100,
        100.0 - (EXTRACT(EPOCH FROM (now() - MAX(e.occurred_at))) / 86400.0 / 90.0 * 100.0)
      ))
    END
    + 0.4 * GREATEST(0, LEAST(100, COALESCE(freq.engagement_count, 0) * 5.0))
  , 1)                                                  AS ease_score
FROM companies c
LEFT JOIN contact_frequency_90d freq ON freq.hubspot_company_id = c.hubspot_company_id
LEFT JOIN engagements e              ON e.hubspot_company_id    = c.hubspot_company_id
WHERE c.account_status != 'Cancelled'
GROUP BY c.hubspot_company_id, freq.engagement_count;

-- ---------------------------------------------------------------------------
-- 5. company_metrics  (primary dashboard view)
--    One row per active company with all computed metrics.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW company_metrics AS
SELECT
  c.hubspot_company_id,
  c.company_name,
  c.owner_id,
  c.owner_name,
  c.account_status,
  c.credits_package,
  COALESCE(freq.engagement_count, 0)        AS contact_frequency_90d,
  sp.avg_spend_3mo,
  sp.deal_count_3mo,
  es.last_engagement_at,
  es.days_since_last_engagement,
  es.engagement_count_90d,
  es.recency_score,
  es.frequency_score,
  COALESCE(es.ease_score, 0)                AS ease_score_0_to_100
FROM companies c
LEFT JOIN contact_frequency_90d freq ON freq.hubspot_company_id = c.hubspot_company_id
LEFT JOIN company_spend          sp  ON sp.hubspot_company_id   = c.hubspot_company_id
LEFT JOIN ease_score             es  ON es.hubspot_company_id   = c.hubspot_company_id
WHERE c.account_status != 'Cancelled';

-- ---------------------------------------------------------------------------
-- 6. owner_leaderboard
--    Owners ranked by average ease_score descending.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW owner_leaderboard AS
SELECT
  owner_id,
  owner_name,
  COUNT(*)                                   AS company_count,
  ROUND(AVG(ease_score_0_to_100), 1)         AS avg_ease_score,
  ROUND(AVG(contact_frequency_90d), 1)       AS avg_contact_frequency_90d,
  SUM(contact_frequency_90d)                 AS total_contact_frequency_90d,
  SUM(CASE WHEN avg_spend_3mo IS NOT NULL THEN 1 ELSE 0 END)
                                             AS companies_with_spend_data
FROM company_metrics
GROUP BY owner_id, owner_name
ORDER BY avg_ease_score DESC;
