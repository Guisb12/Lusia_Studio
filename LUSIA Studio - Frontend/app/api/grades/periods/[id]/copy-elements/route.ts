import { proxyAuthedJson } from "@/app/api/auth/_utils";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyAuthedJson(`/api/v1/grades/periods/${id}/copy-elements`, "POST");
}
