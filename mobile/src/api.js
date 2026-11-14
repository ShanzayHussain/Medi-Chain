import { API_URL } from "./config";

let token = null;
let onUnauthorized = null;

export const setToken = (t) => { token = t; };
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

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

    // 401 while logged in = expired token. (A wrong password at login has no token yet, so it's not affected.)
    if (res.status === 401 && token) {
        token = null;
        if (onUnauthorized) onUnauthorized();
        throw new Error("Session expired, please log in again");
    }
    if (!res.ok) throw new Error(data.detail || "Request failed");
    return data;
}