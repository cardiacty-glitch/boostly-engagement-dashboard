-- Create the metabase database so Metabase has its own schema store.
-- This init script runs against the default DB (engagement_dashboard) as the
-- dashboard user, so we just need to CREATE DATABASE here.
SELECT 'CREATE DATABASE metabase'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'metabase')\gexec
