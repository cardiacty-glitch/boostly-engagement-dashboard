/**
 * POST /api/sync
 *
 * Triggers an incremental HubSpot → Postgres sync.
 * Protected by the CRON_SECRET environment variable.
 *
 * Called automatically by Vercel Cron (see vercel.json).
 * Can also be triggered manually:
 *   curl -X POST https://your-app.vercel.app/api/sync \
 *        -H "Authorization: Bearer $CRON_SECRET"
 *
 * NOTE: Full syncs can exceed Vercel's default 10-second limit.
 * Set maxDuration: 300 (requires Vercel Pro) or run full syncs
 * locally with `npm run sync:full`.
 */

// Allow up to 5 minutes on Vercel Pro; hobby plan will cut it at 10 s.
export const maxDuration = 300;

export async function POST(request: Request) {
  // Verify the request is from Vercel Cron or an authorized caller.
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fullSync = new URL(request.url).searchParams.get("full") === "1";

  try {
    // Dynamically import the sync entry-point so it only runs server-side
    // and doesn't bloat the client bundle.
    const { runSync } = await import("@/sync/runner");
    await runSync({ full: fullSync });
    return Response.json({ ok: true, full: fullSync });
  } catch (err) {
    console.error("[api/sync]", err);
    return Response.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}

// Vercel Cron sends GET; redirect to POST handler.
export async function GET(request: Request) {
  return POST(request);
}
