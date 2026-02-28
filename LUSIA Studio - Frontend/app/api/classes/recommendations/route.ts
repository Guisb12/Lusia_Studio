import { proxyAuthedJson } from "@/app/api/auth/_utils";

export async function GET() {
    return proxyAuthedJson("/api/v1/classrooms/recommendations", "GET");
}
