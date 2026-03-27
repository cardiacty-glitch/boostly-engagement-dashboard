import { COMPANIES } from "@/lib/static-data";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner") ?? undefined;

  const companies = owner
    ? COMPANIES.filter((c) => c.owner_name === owner)
    : COMPANIES;

  return Response.json({ companies });
}
