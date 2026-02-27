/**
 * Upload an image for a note/artifact and return the proxy URL.
 *
 * The returned URL goes through our Next.js API route which generates
 * a fresh signed URL on each request, so it never expires.
 */
export async function uploadNoteImage(
    artifactId: string,
    file: File,
): Promise<string> {
    const formData = new FormData();
    formData.append("file", file, file.name);

    const res = await fetch(`/api/artifacts/${artifactId}/images/upload`, {
        method: "POST",
        body: formData,
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || `Upload failed: ${res.status}`);
    }

    const data: { path: string; image_name: string } = await res.json();
    return `/api/artifacts/${artifactId}/images/${data.image_name}`;
}
