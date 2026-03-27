"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { OwnerRow, CompanyRow } from "@/lib/db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function easeColor(score: number): string {
  if (score >= 67) return "bg-green-100 text-green-800";
  if (score >= 34) return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
}

function formatDaysAgo(days: number | null): string {
  if (days === null) return "Never";
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  if (days < 7) return `${Math.floor(days)}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatSpend(avg: number | null): string {
  if (avg === null) return "—";
  return `$${Math.round(avg).toLocaleString("en-US")}/mo`;
}

type SortKey = "ease_score_0_to_100" | "contact_frequency_90d" | "company_name" | "days_since_last_engagement";

const ENGAGEMENT_LABELS: Record<string, string> = {
  EMAIL: "Email",
  CALL: "Call",
  MEETING: "Meeting",
  NOTE: "Note",
  TASK: "Task",
};

const ENGAGEMENT_COLORS: Record<string, string> = {
  EMAIL: "bg-blue-100 text-blue-700",
  CALL: "bg-purple-100 text-purple-700",
  MEETING: "bg-green-100 text-green-700",
  NOTE: "bg-yellow-100 text-yellow-700",
  TASK: "bg-gray-100 text-gray-700",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SortButton({
  label,
  field,
  current,
  dir,
  onClick,
}: {
  label: string;
  field: SortKey;
  current: SortKey;
  dir: "asc" | "desc";
  onClick: (f: SortKey) => void;
}) {
  const active = current === field;
  return (
    <button
      onClick={() => onClick(field)}
      className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wide select-none ${
        active ? "text-blue-600" : "text-gray-400 hover:text-gray-600"
      }`}
    >
      {label}
      <span className="text-[10px]">
        {active ? (dir === "desc" ? "↓" : "↑") : "↕"}
      </span>
    </button>
  );
}

function CompanyTable({
  companies,
  loading,
}: {
  companies: CompanyRow[];
  loading: boolean;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("ease_score_0_to_100");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSort(field: SortKey) {
    if (field === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(field);
      setSortDir("desc");
    }
  }

  const sorted = [...companies].sort((a, b) => {
    let diff = 0;
    if (sortKey === "ease_score_0_to_100")
      diff = a.ease_score_0_to_100 - b.ease_score_0_to_100;
    else if (sortKey === "contact_frequency_90d")
      diff = a.contact_frequency_90d - b.contact_frequency_90d;
    else if (sortKey === "company_name")
      diff = (a.company_name ?? "").localeCompare(b.company_name ?? "");
    else if (sortKey === "days_since_last_engagement")
      diff =
        (a.days_since_last_engagement ?? 999) -
        (b.days_since_last_engagement ?? 999);
    return sortDir === "desc" ? -diff : diff;
  });

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <p className="text-center text-gray-400 text-sm py-12">
        No active companies found.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left px-4 py-3">
              <SortButton
                label="Company"
                field="company_name"
                current={sortKey}
                dir={sortDir}
                onClick={handleSort}
              />
            </th>
            <th className="text-left px-4 py-3 hidden md:table-cell">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Owner
              </span>
            </th>
            <th className="text-left px-4 py-3">
              <SortButton
                label="Contacts (90d)"
                field="contact_frequency_90d"
                current={sortKey}
                dir={sortDir}
                onClick={handleSort}
              />
            </th>
            <th className="text-left px-4 py-3 hidden sm:table-cell">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Spend
              </span>
            </th>
            <th className="text-left px-4 py-3">
              <SortButton
                label="Ease Score"
                field="ease_score_0_to_100"
                current={sortKey}
                dir={sortDir}
                onClick={handleSort}
              />
            </th>
            <th className="text-left px-4 py-3 hidden lg:table-cell">
              <SortButton
                label="Last Contact"
                field="days_since_last_engagement"
                current={sortKey}
                dir={sortDir}
                onClick={handleSort}
              />
            </th>
            <th className="text-left px-4 py-3 hidden lg:table-cell">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Type
              </span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {sorted.map((c) => (
            <tr
              key={c.hubspot_company_id}
              className="hover:bg-gray-50 transition-colors"
            >
              <td className="px-4 py-3">
                <Link
                  href={`/company/${c.hubspot_company_id}`}
                  className="font-medium text-gray-800 hover:text-blue-600 transition-colors"
                >
                  {c.company_name ?? "—"}
                </Link>
              </td>
              <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                {c.owner_name ?? "—"}
              </td>
              <td className="px-4 py-3 text-gray-700 font-medium">
                {c.contact_frequency_90d}
              </td>
              <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">
                {formatSpend(c.avg_spend_3mo)}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${easeColor(
                    c.ease_score_0_to_100
                  )}`}
                >
                  {Number(c.ease_score_0_to_100).toFixed(0)}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">
                {formatDaysAgo(
                  c.days_since_last_engagement !== null
                    ? Number(c.days_since_last_engagement)
                    : null
                )}
              </td>
              <td className="px-4 py-3 hidden lg:table-cell">
                {c.last_engagement_type ? (
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      ENGAGEMENT_COLORS[c.last_engagement_type] ?? "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {ENGAGEMENT_LABELS[c.last_engagement_type] ?? c.last_engagement_type}
                  </span>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Leaderboard({ owners }: { owners: OwnerRow[] }) {
  if (owners.length === 0) {
    return (
      <p className="text-center text-gray-400 text-sm py-12">
        No owner data yet. Run the sync first.
      </p>
    );
  }
  return (
    <div className="divide-y divide-gray-100">
      {owners.map((o, i) => (
        <div key={o.owner_id} className="flex items-center gap-4 px-6 py-4">
          <span className="text-2xl font-bold text-gray-200 w-8 text-right shrink-0">
            {i + 1}
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-800 truncate">{o.owner_name}</p>
            <p className="text-xs text-gray-400">
              {o.company_count} companies · {Number(o.avg_contact_frequency_90d).toFixed(1)} avg contacts/90d
            </p>
          </div>
          <div className="text-right shrink-0">
            <p
              className={`text-sm font-bold px-3 py-1 rounded-full ${easeColor(
                Number(o.avg_ease_score)
              )}`}
            >
              {Number(o.avg_ease_score).toFixed(1)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">avg ease</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HomePage() {
  const [owners, setOwners] = useState<OwnerRow[]>([]);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [selectedOwner, setSelectedOwner] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<"companies" | "leaderboard">(
    "companies"
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMock, setIsMock] = useState(false);

  useEffect(() => {
    fetch("/api/owners")
      .then((r) => r.json())
      .then((d) => {
        setOwners(d.owners ?? []);
        if (d.mock) setIsMock(true);
      })
      .catch(() => setError("Could not load owners. Check DATABASE_URL."));
  }, []);

  const loadCompanies = useCallback((owner: string | null) => {
    setLoading(true);
    const url = owner
      ? `/api/companies?owner=${encodeURIComponent(owner)}`
      : "/api/companies";
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        setCompanies(d.companies ?? []);
        setLoading(false);
      })
      .catch(() => {
        setError("Could not load companies.");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadCompanies(selectedOwner);
  }, [selectedOwner, loadCompanies]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Engagement Dashboard
            </h1>
            <p className="text-sm text-gray-500">
              Contact frequency, spend, and ease-to-reach · last 90 days
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setMainTab("companies")}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                mainTab === "companies"
                  ? "bg-blue-600 text-white"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Companies
            </button>
            <button
              onClick={() => setMainTab("leaderboard")}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                mainTab === "leaderboard"
                  ? "bg-blue-600 text-white"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Leaderboard
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {isMock && (
          <div className="mb-5 flex items-center gap-2 bg-yellow-50 border border-yellow-300 text-yellow-800 rounded-xl px-4 py-3 text-sm">
            <span className="font-semibold">Sample data</span> — no database connected. Add DATABASE_URL to see real HubSpot data.
          </div>
        )}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {mainTab === "companies" && (
          <>
            {/* Owner filter tabs */}
            <div className="flex flex-wrap gap-2 mb-5">
              <button
                onClick={() => setSelectedOwner(null)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  selectedOwner === null
                    ? "bg-gray-900 text-white"
                    : "bg-white border border-gray-200 text-gray-600 hover:border-gray-400"
                }`}
              >
                All
              </button>
              {owners.map((o) => (
                <button
                  key={o.owner_id}
                  onClick={() => setSelectedOwner(o.owner_name)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    selectedOwner === o.owner_name
                      ? "bg-gray-900 text-white"
                      : "bg-white border border-gray-200 text-gray-600 hover:border-gray-400"
                  }`}
                >
                  {o.owner_name}
                </button>
              ))}
            </div>

            {/* Summary bar */}
            {!loading && (
              <p className="text-xs text-gray-400 mb-3">
                {companies.length} active{" "}
                {companies.length === 1 ? "company" : "companies"}
                {selectedOwner ? ` for ${selectedOwner}` : ""}
              </p>
            )}

            {/* Table */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <CompanyTable companies={companies} loading={loading} />
            </div>
          </>
        )}

        {mainTab === "leaderboard" && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Owner Leaderboard</h2>
              <p className="text-xs text-gray-400">Ranked by average ease score</p>
            </div>
            <Leaderboard owners={owners} />
          </div>
        )}
      </main>
    </div>
  );
}
