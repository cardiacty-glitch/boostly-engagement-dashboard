import { getCompanyMetrics } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner") ?? undefined;

  try {
    const companies = await getCompanyMetrics(owner);
    return Response.json({ companies });
  } catch (err) {
    console.error("[api/companies]", err);
    return Response.json(
      { error: "Failed to load companies. Check DATABASE_URL." },
      { status: 500 }
    );
  }
}
