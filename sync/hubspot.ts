import { Client } from "@hubspot/api-client";
import { FilterOperatorEnum } from "@hubspot/api-client/lib/codegen/crm/companies/models/Filter.js";
import type { CompanyRow, EngagementRow, DealRow, OwnerRow } from "./db";

// ---------------------------------------------------------------------------
// Types for raw HubSpot API responses (beyond what the SDK types cover)
// ---------------------------------------------------------------------------

interface HubSpotPage<T> {
  results: T[];
  paging?: { next?: { after?: string } };
}

interface HubSpotEngagement {
  id: string;
  properties: {
    hs_engagement_type?: string | null;
    hs_timestamp?: string | null;
    hs_lastmodifieddate?: string | null;
  };
  associations?: {
    companies?: { results: Array<{ id: string; type: string }> };
  };
}

interface HubSpotDeal {
  id: string;
  properties: {
    dealstage?: string | null;
    closedate?: string | null;
    amount?: string | null;
    hs_lastmodifieddate?: string | null;
  };
}

interface AssociationBatchResult {
  results: Array<{
    from: { id: string };
    to: Array<{ id: string; type: string }>;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parses a HubSpot date value that may be an ISO string or a ms timestamp string. */
function parseHubSpotDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  // Try as a numeric millisecond timestamp first, then fall back to ISO string.
  const asNum = Number(value);
  const d = isFinite(asNum) && asNum > 0 ? new Date(asNum) : new Date(value);
  return isFinite(d.getTime()) ? d : null;
}

// ---------------------------------------------------------------------------
// Property key resolution
// ---------------------------------------------------------------------------

/**
 * Verifies that the expected HubSpot company property keys exist.
 * Logs a warning if either is missing (sync continues regardless; the field
 * will simply come back as null for affected records).
 */
export async function resolvePropertyKeys(hubspot: Client): Promise<{
  creditsPackageKey: string;
  accountStatusKey: string;
}> {
  const EXPECTED = {
    credits_package: "credits_package",
    account_status: "account_status",
  };

  try {
    const response = await hubspot.crm.properties.coreApi.getAll("companies");
    const found = new Set(response.results.map((p: { name: string }) => p.name));

    for (const key of Object.values(EXPECTED)) {
      if (!found.has(key)) {
        console.warn(
          `[hubspot] WARNING: Company property "${key}" not found in this portal. ` +
            `Check the property internal name in HubSpot Settings → Properties.`
        );
      } else {
        console.log(`[hubspot] Resolved property key: ${key} ✓`);
      }
    }
  } catch (err) {
    console.warn("[hubspot] Could not fetch property list:", err);
  }

  return {
    creditsPackageKey: EXPECTED.credits_package,
    accountStatusKey: EXPECTED.account_status,
  };
}

// ---------------------------------------------------------------------------
// Owners
// ---------------------------------------------------------------------------

export async function fetchOwners(hubspot: Client): Promise<OwnerRow[]> {
  const rows: OwnerRow[] = [];
  let after: string | undefined;

  do {
    const page = await hubspot.crm.owners.ownersApi.getPage(
      undefined,
      after,
      100
    );
    for (const o of page.results) {
      rows.push({
        owner_id: String(o.id),
        owner_name: `${o.firstName ?? ""} ${o.lastName ?? ""}`.trim(),
        email: o.email ?? null,
      });
    }
    after = page.paging?.next?.after;
  } while (after);

  return rows;
}

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------

export async function* fetchAllCompanies(
  hubspot: Client,
  creditsPackageKey: string,
  accountStatusKey: string,
  modifiedSince: Date
): AsyncGenerator<CompanyRow> {
  // Owner name lookup skipped — crm.objects.owners.read scope not available.
  // owner_name will be null; owner filtering won't work until scope is added.

  const properties = [
    "name",
    "hubspot_owner_id",
    creditsPackageKey,
    accountStatusKey,
    "hs_lastmodifieddate",
  ];

  const isFullSync = modifiedSince.getTime() === 0;

  if (isFullSync) {
    // Full sync: use the basic list API — no 10,000-result cap.
    let after: string | undefined;
    do {
      const response = await hubspot.crm.companies.basicApi.getPage(
        100,
        after,
        properties
      );
      for (const company of response.results) {
        yield mapCompany(company, creditsPackageKey, accountStatusKey);
      }
      after = response.paging?.next?.after;
    } while (after);
  } else {
    // Incremental sync: use the search API to filter by modified date.
    // The search API caps at 10,000 results, which is fine for incremental windows.
    let after: string | undefined;
    do {
      const response = await hubspot.crm.companies.searchApi.doSearch({
        filterGroups: [
          {
            filters: [
              {
                propertyName: "hs_lastmodifieddate",
                operator: FilterOperatorEnum.Gte,
                value: String(modifiedSince.getTime()),
              },
            ],
          },
        ],
        properties,
        sorts: ["hs_lastmodifieddate"],
        limit: 100,
        after: after ?? "0",
      });
      for (const company of response.results) {
        yield mapCompany(company, creditsPackageKey, accountStatusKey);
      }
      after = response.paging?.next?.after;
    } while (after);
  }
}

function mapCompany(
  company: { id: string; properties: Record<string, string | null | undefined> },
  creditsPackageKey: string,
  accountStatusKey: string
): CompanyRow {
  const p = company.properties;
  return {
    hubspot_company_id: company.id,
    company_name: p["name"] ?? null,
    owner_id: p["hubspot_owner_id"] ?? null,
    owner_name: null,
    credits_package:
      p[creditsPackageKey] && p[creditsPackageKey]!.trim() !== ""
        ? p[creditsPackageKey]!
        : null,
    account_status: p[accountStatusKey] ?? null,
    hs_updated_at: p["hs_lastmodifieddate"]
      ? new Date(p["hs_lastmodifieddate"]!)
      : null,
  };
}

// ---------------------------------------------------------------------------
// Engagements
// Uses the search API with a server-side date filter to avoid fetching all
// records ever. Company associations are fetched in a separate batch call.
// ---------------------------------------------------------------------------

export async function* fetchAllEngagements(
  hubspot: Client,
  modifiedSince: Date
): AsyncGenerator<EngagementRow> {
  let after: string | undefined;

  do {
    // Filter by hs_timestamp (occurrence date) so we get engagements that
    // actually happened in the window, not just ones that were recently modified.
    const rawSearchResponse = await hubspot.apiRequest({
      method: "POST",
      path: "/crm/v3/objects/engagements/search",
      body: {
        filterGroups: [
          {
            filters: [
              {
                propertyName: "hs_timestamp",
                operator: "GTE",
                value: String(modifiedSince.getTime()),
              },
            ],
          },
        ],
        properties: ["hs_engagement_type", "hs_timestamp", "hs_lastmodifieddate"],
        sorts: ["hs_timestamp"],
        limit: 100,
        ...(after ? { after } : {}),
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = (await (rawSearchResponse as any).json()) as HubSpotPage<HubSpotEngagement>;

    const engagements: HubSpotEngagement[] = response.results ?? [];
    if (engagements.length === 0) break;

    // Batch-fetch company associations for this page.
    const assocMap = await batchFetchEngagementCompanyAssociations(
      hubspot,
      engagements.map((e: HubSpotEngagement) => e.id)
    );

    for (const eng of engagements) {
      const companyId = assocMap.get(eng.id);
      if (!companyId) continue; // skip engagements with no company

      const p = eng.properties;
      const occurredAt = parseHubSpotDate(p.hs_timestamp);
      const updatedAt = parseHubSpotDate(p.hs_lastmodifieddate);

      yield {
        hubspot_engagement_id: eng.id,
        hubspot_company_id: companyId,
        engagement_type: p.hs_engagement_type ?? null,
        occurred_at: occurredAt,
        hs_updated_at: updatedAt,
      };
    }

    after = (response as HubSpotPage<HubSpotEngagement>).paging?.next?.after;
  } while (after);
}

async function batchFetchEngagementCompanyAssociations(
  hubspot: Client,
  engagementIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (engagementIds.length === 0) return map;

  const rawResponse = await hubspot.apiRequest({
    method: "POST",
    path: "/crm/v3/associations/engagements/companies/batch/read",
    body: { inputs: engagementIds.map((id) => ({ id })) },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (await (rawResponse as any).json()) as AssociationBatchResult;

  for (const entry of result.results ?? []) {
    const firstCompany = entry.to?.[0];
    if (firstCompany) {
      map.set(entry.from.id, firstCompany.id);
    }
  }

  return map;
}

// ---------------------------------------------------------------------------
// Deals (Closed Won only) + company associations
// ---------------------------------------------------------------------------

const BATCH_SIZE = 100;

export async function* fetchAllClosedWonDeals(
  hubspot: Client,
  modifiedSince: Date
): AsyncGenerator<DealRow> {
  let after: string | undefined;

  do {
    const filters = [
      { propertyName: "dealstage", operator: FilterOperatorEnum.Eq, value: "closedwon" },
      ...(modifiedSince.getTime() > 0
        ? [{
            propertyName: "hs_lastmodifieddate",
            operator: FilterOperatorEnum.Gte,
            value: String(modifiedSince.getTime()),
          }]
        : []),
    ];

    const response = await hubspot.crm.deals.searchApi.doSearch({
      filterGroups: [{ filters }],
      properties: ["dealstage", "closedate", "amount", "hs_lastmodifieddate"],
      sorts: ["hs_lastmodifieddate"],
      limit: BATCH_SIZE,
      after: after ?? "0",
    });

    const deals = response.results as HubSpotDeal[];
    if (deals.length === 0) break;

    // Batch-fetch company associations for this page of deals.
    const companyMap = await batchFetchDealCompanyAssociations(
      hubspot,
      deals.map((d) => d.id)
    );

    for (const deal of deals) {
      const p = deal.properties;
      const companyId = companyMap.get(deal.id) ?? null;

      yield {
        hubspot_deal_id: deal.id,
        hubspot_company_id: companyId,
        deal_stage: p.dealstage ?? null,
        closedate: p.closedate ? new Date(p.closedate) : null,
        amount: p.amount ? parseFloat(p.amount) : null,
        hs_updated_at: p.hs_lastmodifieddate
          ? new Date(p.hs_lastmodifieddate)
          : null,
      };
    }

    after = response.paging?.next?.after;
  } while (after);
}

/**
 * Given a list of deal IDs, returns a Map<dealId, companyId> using the
 * batch associations endpoint. Only the first associated company per deal
 * is used (deals rarely belong to more than one company in practice).
 */
async function batchFetchDealCompanyAssociations(
  hubspot: Client,
  dealIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (dealIds.length === 0) return map;

  const rawAssocResponse = await hubspot.apiRequest({
    method: "POST",
    path: "/crm/v3/associations/deals/companies/batch/read",
    body: { inputs: dealIds.map((id) => ({ id })) },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (await (rawAssocResponse as any).json()) as AssociationBatchResult;

  for (const entry of result.results ?? []) {
    const firstCompany = entry.to?.[0];
    if (firstCompany) {
      map.set(entry.from.id, firstCompany.id);
    }
  }

  return map;
}
