import { proxyAuthedJson } from "@/app/api/auth/_utils";

export async function GET(
    _request: Request,
    { params }: { params: { code: string } },
) {
    return proxyAuthedJson(
        `/api/v1/materials/base/notes/by-code/${params.code}`,
        "GET",
    );
}
