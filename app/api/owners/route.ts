import { OWNERS } from "@/lib/static-data";

export async function GET() {
  return Response.json({ owners: OWNERS });
}
