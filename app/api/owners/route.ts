import { getOwnerLeaderboard } from "@/lib/db";
import { MOCK_OWNERS } from "@/lib/mock-data";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return Response.json({ owners: MOCK_OWNERS, mock: true });
  }
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
