"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import type { CompanyRecord } from "@/lib/static-data";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusColor(status: string | null): string {
  if (!status) return "bg-gray-100 text-gray-500";
  if (status === "Active") return "bg-green-100 text-green-800";
  if (status === "Paused") return "bg-yellow-100 text-yellow-800";
  if (status === "Pending Cancellation") return "bg-orange-100 text-orange-800";
  return "bg-gray-100 text-gray-500";
}

function formatDaysAgo(days: number | null): string {
  if (days === null) return "Never";
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  if (days < 7) return `${Math.floor(days)}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatRenewalDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const [year, month, day] = dateStr.split("-");
  return `${parseInt(month)}/${parseInt(day)}/${year}`;
}

function formatRevenue(amount: number | null): string {
  if (amount === null) return "—";
  if (amount >= 1_000_000)
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000)
    return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount}`;
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-3">
      <span className="text-sm text-gray-400 w-36 shrink-0">{label}</span>
      <span className="text-sm text-gray-700">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [company, setCompany] = useState<CompanyRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/company/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((d) => {
        setCompany(d.company);
        setLoading(false);
      })
      .catch(() => {
        setError("Could not load company data.");
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="h-40 bg-gray-200 rounded-2xl animate-pulse" />
          <div className="h-60 bg-gray-200 rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">{error ?? "Company not found."}</p>
          <Link href="/" className="text-blue-600 hover:underline text-sm">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const address = [company.address, company.city, company.state, company.zip]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* Back + header */}
        <div className="mb-8">
          <Link
            href="/"
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Back to Dashboard
          </Link>
          <div className="mt-3 flex items-start justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {company.company_name}
              </h1>
              <p className="text-gray-500 text-sm mt-0.5">
                {company.owner_name ?? "Unassigned"}
                {company.industry ? ` · ${company.industry}` : ""}
              </p>
            </div>
            {company.account_status && (
              <span
                className={`text-xs font-semibold px-3 py-1 rounded-full ${statusColor(
                  company.account_status
                )}`}
              >
                {company.account_status}
              </span>
            )}
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 mb-1">Last Contacted</p>
            <p className="text-lg font-bold text-gray-900">
              {formatDaysAgo(company.days_since_last_contacted)}
            </p>
            {company.last_contacted && (
              <p className="text-xs text-gray-400 mt-0.5">{company.last_contacted}</p>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 mb-1">Locations</p>
            <p className="text-lg font-bold text-gray-900">
              {company.child_locations > 0 ? company.child_locations : "1"}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {company.child_locations > 0 ? "child locations" : "single location"}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 mb-1">Annual Revenue</p>
            <p className="text-lg font-bold text-gray-900">
              {formatRevenue(company.annual_revenue)}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 mb-1">Employees</p>
            <p className="text-lg font-bold text-gray-900">
              {company.employees ?? "—"}
            </p>
          </div>
        </div>

        {/* Details */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">Details</h2>
          <InfoRow label="Credits Package" value={company.credits_package} />
          <InfoRow label="Lifecycle" value={company.lifecycle} />
          <InfoRow label="Next Renewal Date" value={formatRenewalDate(company.next_renewal_date)} />
          <InfoRow label="Last Account Review" value={company.last_account_review} />
          <InfoRow label="Next Review" value={company.next_review_scheduled} />
          <InfoRow label="Address" value={address || null} />
          <InfoRow label="Phone" value={company.phone} />
          <InfoRow label="Website" value={company.website} />
        </div>

        {/* Description */}
        {company.description && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-3">About</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              {company.description}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
