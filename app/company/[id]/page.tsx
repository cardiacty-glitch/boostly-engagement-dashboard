"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import type { CompanyRow, EngagementTypeRow, RecentEngagementRow, LatestDealRow } from "@/lib/db";

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

function formatSpend(spend: string | null, source: string | null): string {
  if (!spend) return "—";
  const num = parseFloat(spend);
  if (isNaN(num)) return spend;
  return source === "credits_package"
    ? `${num.toLocaleString()} credits`
    : `$${num.toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

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
// Components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
  colorClass,
}: {
  label: string;
  value: string;
  sub?: string;
  colorClass?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colorClass ?? "text-gray-900"}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface CompanyDetailData {
  metrics: CompanyRow;
  engagementTypes: EngagementTypeRow[];
  recentEngagements: RecentEngagementRow[];
  latestDeal: LatestDealRow | null;
}

export default function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [data, setData] = useState<CompanyDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/company/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((d) => {
        setData(d);
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
        <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-2xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
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

  const { metrics, engagementTypes, recentEngagements, latestDeal } = data;
  const ease = Number(metrics.ease_score_0_to_100);
  const days = metrics.days_since_last_engagement !== null
    ? Number(metrics.days_since_last_engagement)
    : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">

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
                {metrics.company_name ?? "Unknown Company"}
              </h1>
              <p className="text-gray-500 text-sm mt-0.5">
                {metrics.owner_name ?? "Unassigned"}
              </p>
            </div>
            {metrics.account_status && (
              <span
                className={`text-xs font-medium px-3 py-1 rounded-full ${
                  metrics.account_status === "Cancelled"
                    ? "bg-red-100 text-red-700"
                    : "bg-green-100 text-green-700"
                }`}
              >
                {metrics.account_status}
              </span>
            )}
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Ease Score"
            value={ease.toFixed(0)}
            sub="0 = unreachable · 100 = easy"
            colorClass={
              ease >= 67
                ? "text-green-700"
                : ease >= 34
                ? "text-yellow-700"
                : "text-red-700"
            }
          />
          <StatCard
            label="Contact Freq"
            value={String(metrics.contact_frequency_90d)}
            sub="engagements in 90 days"
          />
          <StatCard
            label="Spend"
            value={formatSpend(metrics.spend, metrics.spend_source)}
            sub={
              metrics.spend_source === "credits_package"
                ? "credits package"
                : metrics.spend_source === "latest_closed_won_deal"
                ? "last closed won deal"
                : "no data"
            }
          />
          <StatCard
            label="Last Contact"
            value={formatDaysAgo(days)}
            sub={metrics.last_engagement_at ? formatDate(metrics.last_engagement_at) : undefined}
          />
        </div>

        <div className="grid md:grid-cols-2 gap-6">

          {/* Engagement type breakdown */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">
                Engagement Types
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">last 90 days</p>
            </div>
            <div className="p-5">
              {engagementTypes.length === 0 ? (
                <p className="text-sm text-gray-400">No engagements in last 90 days.</p>
              ) : (
                <div className="space-y-3">
                  {engagementTypes.map((et) => {
                    const total = engagementTypes.reduce((s, e) => s + Number(e.count), 0);
                    const pct = Math.round((Number(et.count) / total) * 100);
                    return (
                      <div key={et.engagement_type}>
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              ENGAGEMENT_COLORS[et.engagement_type] ?? "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {ENGAGEMENT_LABELS[et.engagement_type] ?? et.engagement_type}
                          </span>
                          <span className="text-sm font-semibold text-gray-700">
                            {et.count}
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-400 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Recent engagements */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Recent Engagements</h2>
              <p className="text-xs text-gray-400 mt-0.5">last 10 interactions</p>
            </div>
            <div className="divide-y divide-gray-50">
              {recentEngagements.length === 0 ? (
                <p className="text-sm text-gray-400 px-5 py-4">No engagements on record.</p>
              ) : (
                recentEngagements.map((e, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
                        ENGAGEMENT_COLORS[e.engagement_type] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {ENGAGEMENT_LABELS[e.engagement_type] ?? e.engagement_type}
                    </span>
                    <span className="text-sm text-gray-600">
                      {formatDate(e.occurred_at)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Latest Closed Won deal */}
        {latestDeal && (
          <div className="mt-6 bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-3">
              Latest Closed Won Deal
            </h2>
            <div className="flex items-center gap-6">
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  ${Number(latestDeal.amount).toLocaleString("en-US", {
                    minimumFractionDigits: 0,
                  })}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">deal amount</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">
                  {formatDate(latestDeal.closedate)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">close date</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
