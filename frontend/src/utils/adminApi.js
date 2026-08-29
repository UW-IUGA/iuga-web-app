export async function adminRequest(path, options = {}) {
    const response = await fetch(`/api/v1/${path}`, {
        credentials: "include",
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "The admin request failed");
    return data;
}
