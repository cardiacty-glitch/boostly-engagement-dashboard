import { getCompanyDetail } from "@/lib/db";
import { getMockDetail } from "@/lib/mock-data";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!process.env.DATABASE_URL) {
    const detail = getMockDetail(id);
    if (!detail.metrics) {
      return Response.json({ error: "Company not found" }, { status: 404 });
    }
    return Response.json({ ...detail, mock: true });
  }

  try {
    const detail = await getCompanyDetail(id);
    if (!detail.metrics) {
      return Response.json({ error: "Company not found" }, { status: 404 });
    }
    return Response.json(detail);
  } catch (err) {
    console.error("[api/company/[id]]", err);
    return Response.json(
      { error: "Failed to load company detail." },
      { status: 500 }
    );
  }
}
