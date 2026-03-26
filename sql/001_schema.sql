-- Engagement Dashboard — table definitions
-- All timestamps stored as TIMESTAMPTZ (UTC). Timezone conversions happen in views.

CREATE TABLE IF NOT EXISTS owners (
  owner_id   TEXT PRIMARY KEY,
  owner_name TEXT NOT NULL,
  email      TEXT,
  synced_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS companies (
  hubspot_company_id TEXT PRIMARY KEY,
  company_name       TEXT,
  owner_id           TEXT REFERENCES owners(owner_id) ON DELETE SET NULL,
  owner_name         TEXT,
  credits_package    TEXT,        -- raw value from HubSpot; non-null/non-empty = usage-based
  account_status     TEXT,        -- exact HubSpot value, e.g. "Cancelled"
  hs_updated_at      TIMESTAMPTZ, -- HubSpot hs_lastmodifieddate
  synced_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS companies_owner_id_idx ON companies(owner_id);
CREATE INDEX IF NOT EXISTS companies_account_status_idx ON companies(account_status);

CREATE TABLE IF NOT EXISTS engagements (
  hubspot_engagement_id TEXT PRIMARY KEY,
  hubspot_company_id    TEXT NOT NULL REFERENCES companies(hubspot_company_id) ON DELETE CASCADE,
  engagement_type       TEXT,        -- EMAIL, CALL, MEETING, NOTE, TASK
  occurred_at           TIMESTAMPTZ, -- hs_timestamp
  hs_updated_at         TIMESTAMPTZ, -- hs_lastmodifieddate
  synced_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS engagements_company_id_idx      ON engagements(hubspot_company_id);
CREATE INDEX IF NOT EXISTS engagements_occurred_at_idx     ON engagements(occurred_at);
CREATE INDEX IF NOT EXISTS engagements_company_occurred_idx ON engagements(hubspot_company_id, occurred_at);

CREATE TABLE IF NOT EXISTS deals (
  hubspot_deal_id    TEXT PRIMARY KEY,
  hubspot_company_id TEXT REFERENCES companies(hubspot_company_id) ON DELETE SET NULL,
  deal_stage         TEXT,
  closedate          TIMESTAMPTZ,
  amount             NUMERIC(14, 2),
  hs_updated_at      TIMESTAMPTZ, -- hs_lastmodifieddate
  synced_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deals_company_id_idx ON deals(hubspot_company_id);
CREATE INDEX IF NOT EXISTS deals_stage_idx      ON deals(deal_stage);
CREATE INDEX IF NOT EXISTS deals_closedate_idx  ON deals(closedate DESC);

-- Tracks the last successful sync time per entity type for incremental sync.
CREATE TABLE IF NOT EXISTS sync_state (
  entity      TEXT PRIMARY KEY,  -- 'companies' | 'engagements' | 'deals'
  last_synced TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01T00:00:00Z'
);

INSERT INTO sync_state (entity) VALUES ('companies'), ('engagements'), ('deals')
  ON CONFLICT (entity) DO NOTHING;
