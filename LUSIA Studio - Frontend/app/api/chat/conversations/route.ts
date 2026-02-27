import { NextRequest } from "next/server";
import { proxyAuthedJson } from "@/app/api/auth/_utils";

export async function GET() {
  return proxyAuthedJson("/api/v1/chat/conversations", "GET");
}

export async function POST() {
  return proxyAuthedJson("/api/v1/chat/conversations", "POST");
}
