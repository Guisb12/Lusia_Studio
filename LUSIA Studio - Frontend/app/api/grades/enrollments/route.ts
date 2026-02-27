import { NextRequest } from "next/server";
import { proxyAuthedJson } from "@/app/api/auth/_utils";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const year = searchParams.get("academic_year") || "";
  return proxyAuthedJson(`/api/v1/grades/enrollments?academic_year=${year}`, "GET");
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  return proxyAuthedJson("/api/v1/grades/enrollments", "POST", body);
}
