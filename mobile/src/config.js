import { Platform } from "react-native";

const phone =
    process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.16:8000";

export const API_URL =
    Platform.OS === "web" ? "http://localhost:8000" : phone;