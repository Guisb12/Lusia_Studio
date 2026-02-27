import { NextRequest, NextResponse } from "next/server";
import { BACKEND_API_URL } from "@/lib/config";
import { getAccessToken } from "@/app/api/auth/_utils";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
    const accessToken = await getAccessToken();
    if (!accessToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!BACKEND_API_URL) {
        return NextResponse.json(
            { error: "NEXT_PUBLIC_API_BASE_URL is not configured." },
            { status: 500 },
        );
    }

    const incoming = await req.formData();
    const file = incoming.get("file");

    if (!(file instanceof Blob)) {
        return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const fd = new FormData();
    fd.append("file", file);

    const res = await fetch(
        `${BACKEND_API_URL}/api/v1/chat/storage/upload`,
        {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}` },
            body: fd,
        },
    );

    const text = await res.text();
    if (!res.ok) {
        return new NextResponse(text || "Upload failed", { status: res.status });
    }

    try {
        return NextResponse.json(JSON.parse(text));
    } catch {
        return new NextResponse(text, {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    }
}
