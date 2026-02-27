import { proxyAuthedJson } from "@/app/api/auth/_utils";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ year: string }> },
) {
  const { year } = await params;
  return proxyAuthedJson(`/api/v1/grades/board/${year}`, "GET");
}
