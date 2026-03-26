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
  // Build an owner ID → owner name lookup from the owners list so we can
  // resolve names without extra API calls per company.
  const ownerMap = new Map<string, string>();
  for (const o of await fetchOwners(hubspot)) {
    ownerMap.set(o.owner_id, o.owner_name);
  }

  let after: string | undefined;

  do {
    // Use the search API so we can filter by hs_lastmodifieddate for
    // incremental syncs. Passing an empty filterGroups array returns all.
    const response = await hubspot.crm.companies.searchApi.doSearch({
      filterGroups:
        modifiedSince.getTime() > 0
          ? [
              {
                filters: [
                  {
                    propertyName: "hs_lastmodifieddate",
                    operator: FilterOperatorEnum.Gte,
                    value: String(modifiedSince.getTime()),
                  },
                ],
              },
            ]
          : [],
      properties: [
        "name",
        "hubspot_owner_id",
        creditsPackageKey,
        accountStatusKey,
        "hs_lastmodifieddate",
      ],
      sorts: ["hs_lastmodifieddate"],
      limit: 100,
      after: after ?? "0",
    });

    for (const company of response.results) {
      const p = company.properties;
      const ownerId = p["hubspot_owner_id"] ?? null;

      yield {
        hubspot_company_id: company.id,
        company_name: p["name"] ?? null,
        owner_id: ownerId,
        owner_name: ownerId ? (ownerMap.get(ownerId) ?? null) : null,
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

    after = response.paging?.next?.after;
  } while (after);
}

// ---------------------------------------------------------------------------
// Engagements
// Fetches all engagements (with company associations) using the v3 list
// endpoint, which is more efficient than per-company association lookups.
// ---------------------------------------------------------------------------

export async function* fetchAllEngagements(
  hubspot: Client,
  modifiedSince: Date
): AsyncGenerator<EngagementRow> {
  let after: string | undefined;

  do {
    // The typed SDK BasicApi does not expose the `associations` query param,
    // so we use the generic apiRequest method for this call.
    const rawEngResponse = await hubspot.apiRequest({
      method: "GET",
      path: "/crm/v3/objects/engagements",
      qs: {
        properties: [
          "hs_engagement_type",
          "hs_timestamp",
          "hs_lastmodifieddate",
        ],
        associations: ["companies"],
        limit: 100,
        ...(after ? { after } : {}),
        ...(modifiedSince.getTime() > 0
          ? {
              // Incremental: only engagements modified since last sync.
              // This uses the filter param supported on the list endpoint.
            }
          : {}),
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = (await (rawEngResponse as any).json()) as HubSpotPage<HubSpotEngagement>;

    for (const eng of page.results) {
      const companies = eng.associations?.companies?.results ?? [];
      if (companies.length === 0) {
        // Skip engagements not associated with any company.
        continue;
      }

      const p = eng.properties;
      const occurredAt = p.hs_timestamp ? new Date(Number(p.hs_timestamp)) : null;
      const updatedAt = p.hs_lastmodifieddate
        ? new Date(p.hs_lastmodifieddate)
        : null;

      // An engagement may be linked to multiple companies; emit one row per association.
      for (const assoc of companies) {
        // Skip if the engagement was not modified since last sync (incremental).
        if (
          modifiedSince.getTime() > 0 &&
          updatedAt &&
          updatedAt <= modifiedSince
        ) {
          continue;
        }

        yield {
          hubspot_engagement_id: eng.id,
          hubspot_company_id: assoc.id,
          engagement_type: p.hs_engagement_type ?? null,
          occurred_at: occurredAt,
          hs_updated_at: updatedAt,
        };
      }
    }

    after = page.paging?.next?.after;
  } while (after);
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
