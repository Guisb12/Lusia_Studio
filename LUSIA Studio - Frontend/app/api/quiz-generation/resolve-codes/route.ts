import { proxyAuthedJson } from "@/app/api/auth/_utils";

export async function POST(request: Request) {
    const body = await request.json().catch(() => ({}));
    return proxyAuthedJson(
        "/api/v1/quiz-generation/resolve-codes",
        "POST",
        body,
    );
}
