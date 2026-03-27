import { COMPANIES } from "@/lib/static-data";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const company = COMPANIES.find((c) => c.id === id);

  if (!company) {
    return Response.json({ error: "Company not found" }, { status: 404 });
  }

  return Response.json({ company });
}
