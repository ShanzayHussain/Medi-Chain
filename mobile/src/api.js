import { API_URL } from "./config";

let token = null;
export const setToken = (t) => { token = t; };

export async function api(path, method = "GET", body) {
    const res = await fetch(API_URL + path, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Request failed");
    return data;
}