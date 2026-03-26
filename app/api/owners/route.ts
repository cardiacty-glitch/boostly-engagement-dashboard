import { getOwnerLeaderboard } from "@/lib/db";

export async function GET() {
  try {
    const owners = await getOwnerLeaderboard();
    return Response.json({ owners });
  } catch (err) {
    console.error("[api/owners]", err);
    return Response.json(
      { error: "Failed to load owners. Check DATABASE_URL." },
      { status: 500 }
    );
  }
}
