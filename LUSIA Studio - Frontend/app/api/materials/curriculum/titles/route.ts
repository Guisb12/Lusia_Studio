import { proxyAuthedJson } from "@/app/api/auth/_utils";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const codes = searchParams.get("codes") || "";
    return proxyAuthedJson(
        `/api/v1/materials/base/curriculum/titles?codes=${encodeURIComponent(codes)}`,
        "GET",
    );
}
