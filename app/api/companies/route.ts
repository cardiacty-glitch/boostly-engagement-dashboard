import { getCompanyMetrics } from "@/lib/db";
import { MOCK_COMPANIES } from "@/lib/mock-data";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner") ?? undefined;

  if (!process.env.DATABASE_URL) {
    const companies = owner
      ? MOCK_COMPANIES.filter((c) => c.owner_name === owner)
      : MOCK_COMPANIES;
    return Response.json({ companies, mock: true });
  }

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
