import { proxyAuthedJson } from "@/app/api/auth/_utils";

export async function GET(
    _request: Request,
    { params }: { params: { id: string } },
) {
    return proxyAuthedJson(
        `/api/v1/materials/base/notes/by-curriculum/${params.id}`,
        "GET",
    );
}
