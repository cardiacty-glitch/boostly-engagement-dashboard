import { getCompanyDetail } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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
