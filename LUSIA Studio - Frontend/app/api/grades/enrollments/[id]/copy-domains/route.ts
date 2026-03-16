import { NextRequest } from "next/server";
import { proxyAuthedJson } from "@/app/api/auth/_utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  return proxyAuthedJson(
    `/api/v1/grades/enrollments/${id}/copy-domains`,
    "POST",
    body,
  );
}
