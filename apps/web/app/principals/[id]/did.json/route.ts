import { didDocument } from "@/lib/identity";
import { readState } from "@/lib/store";
export const dynamic = "force-dynamic";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if ((await readState()).principal?.principalId !== id)
    return Response.json(
      { error: "Principal을 찾을 수 없습니다." },
      { status: 404 },
    );
  return Response.json(await didDocument(id));
}
