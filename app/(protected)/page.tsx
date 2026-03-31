"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { CompanyRecord, OwnerSummary } from "@/lib/static-data";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusColor(status: string | null): string {
  if (!status) return "bg-gray-100 text-gray-500";
  if (status === "Active") return "bg-green-100 text-green-800";
  if (status === "Paused") return "bg-yellow-100 text-yellow-800";
  if (status === "Pending Cancellation") return "bg-orange-100 text-orange-800";
  return "bg-gray-100 text-gray-500"; // Inactive, etc.
}

function formatDaysAgo(days: number | null): string {
  if (days === null) return "Never";
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  if (days < 7) return `${Math.floor(days)}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

type SortKey =
  | "company_name"
  | "days_since_last_contacted"
  | "child_locations"
  | "account_status";

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
  companies: CompanyRecord[];
  loading: boolean;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("company_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(field: SortKey) {
    if (field === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(field);
      setSortDir(field === "company_name" ? "asc" : "desc");
    }
  }

  const sorted = [...companies].sort((a, b) => {
    let diff = 0;
    if (sortKey === "company_name")
      diff = (a.company_name ?? "").localeCompare(b.company_name ?? "");
    else if (sortKey === "days_since_last_contacted")
      diff =
        (a.days_since_last_contacted ?? 9999) -
        (b.days_since_last_contacted ?? 9999);
    else if (sortKey === "child_locations")
      diff = a.child_locations - b.child_locations;
    else if (sortKey === "account_status")
      diff = (a.account_status ?? "").localeCompare(b.account_status ?? "");
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
        No companies found.
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
                label="Status"
                field="account_status"
                current={sortKey}
                dir={sortDir}
                onClick={handleSort}
              />
            </th>
            <th className="text-left px-4 py-3 hidden sm:table-cell">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Package
              </span>
            </th>
            <th className="text-left px-4 py-3 hidden lg:table-cell">
              <SortButton
                label="Locations"
                field="child_locations"
                current={sortKey}
                dir={sortDir}
                onClick={handleSort}
              />
            </th>
            <th className="text-left px-4 py-3">
              <SortButton
                label="Last Contacted"
                field="days_since_last_contacted"
                current={sortKey}
                dir={sortDir}
                onClick={handleSort}
              />
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {sorted.map((c) => (
            <tr
              key={c.id}
              className="hover:bg-gray-50 transition-colors"
            >
              <td className="px-4 py-3">
                <Link
                  href={`/company/${c.id}`}
                  className="font-medium text-gray-800 hover:text-blue-600 transition-colors"
                >
                  {c.company_name}
                </Link>
                {c.city && c.state && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {c.city}, {c.state}
                  </p>
                )}
              </td>
              <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                {c.owner_name ?? "—"}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor(
                    c.account_status
                  )}`}
                >
                  {c.account_status ?? "—"}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">
                {c.credits_package ?? "—"}
              </td>
              <td className="px-4 py-3 text-gray-700 font-medium hidden lg:table-cell">
                {c.child_locations > 0 ? c.child_locations : "—"}
              </td>
              <td className="px-4 py-3 text-gray-500">
                {formatDaysAgo(c.days_since_last_contacted)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const PACKAGE_OPTIONS = [
  "Growth - $260 / mo",
  "Starter - $130 / mo",
  "Plus - $350 / mo",
  "Essentials - $190 / mo",
  "Freemium",
  "Custom",
  "Pro - $475 / mo",
  "Elite - $675 / mo",
  "Boostly Growth Partner Package",
];

export default function HomePage() {
  const [owners, setOwners] = useState<OwnerSummary[]>([]);
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [selectedOwner, setSelectedOwner] = useState<string | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/owners")
      .then((r) => r.json())
      .then((d) => setOwners(d.owners ?? []))
      .catch(() => setError("Could not load owners."));
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
              858 parent companies · Dallas Williams, Chris Hubbard, Kassidy Farrer, Tyler Price
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

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
                  key={o.owner_name}
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

            {/* Package filter */}
            <div className="flex items-center gap-2 mb-5">
              <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide shrink-0">
                Package
              </span>
              <select
                value={selectedPackage ?? ""}
                onChange={(e) =>
                  setSelectedPackage(e.target.value || null)
                }
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:border-blue-400"
              >
                <option value="">All packages</option>
                {PACKAGE_OPTIONS.map((pkg) => (
                  <option key={pkg} value={pkg}>
                    {pkg}
                  </option>
                ))}
                <option value="__none__">No package</option>
              </select>
            </div>

            {/* Summary bar */}
            {!loading && (() => {
              const visible = selectedPackage === "__none__"
                ? companies.filter((c) => !c.credits_package)
                : selectedPackage
                ? companies.filter((c) => c.credits_package === selectedPackage)
                : companies;
              return (
                <p className="text-xs text-gray-400 mb-3">
                  {visible.length}{" "}
                  {visible.length === 1 ? "company" : "companies"}
                  {selectedOwner ? ` for ${selectedOwner}` : ""}
                  {selectedPackage && selectedPackage !== "__none__" ? ` · ${selectedPackage}` : ""}
                  {selectedPackage === "__none__" ? " · No package" : ""}
                </p>
              );
            })()}

            {/* Table */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <CompanyTable
                companies={
                  selectedPackage === "__none__"
                    ? companies.filter((c) => !c.credits_package)
                    : selectedPackage
                    ? companies.filter((c) => c.credits_package === selectedPackage)
                    : companies
                }
                loading={loading}
              />
            </div>
        </>
      </main>
    </div>
  );
}
