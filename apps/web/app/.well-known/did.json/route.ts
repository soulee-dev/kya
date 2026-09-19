import { didDocument } from "@/lib/identity";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(await didDocument());
}
