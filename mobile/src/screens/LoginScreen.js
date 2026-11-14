import { useState } from "react";
import {
    View, Text, StyleSheet, Alert, ScrollView, KeyboardAvoidingView, Platform,
} from "react-native";
import { api, setToken } from "../api";
import { C } from "../theme";
import { Field, PrimaryButton, LinkButton } from "../components/AuthUI";

export default function LoginScreen({ navigation }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    const login = async () => {
        if (!email.trim() || !password) return Alert.alert("Missing", "Enter your email and password");
        setLoading(true);
        try {
            const data = await api("/auth/login", "POST", { email: email.trim(), password });
            setToken(data.access_token);
            navigation.replace("Home", { role: data.role });
        } catch (e) {
            Alert.alert("Login failed", e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.navy }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
                <View style={s.hero}>
                    <View style={s.logo}><Text style={s.logoText}>M</Text></View>
                    <Text style={s.brand}>MediChain</Text>
                    <Text style={s.tagline}>Verified medicines, from factory to pharmacy</Text>
                </View>

                <View style={s.card}>
                    <Text style={s.heading}>Welcome back</Text>
                    <Field label="Email" placeholder="you@example.com" autoCapitalize="none"
                        keyboardType="email-address" value={email} onChangeText={setEmail} />
                    <Field label="Password" placeholder="Your password" secure
                        value={password} onChangeText={setPassword} />
                    <PrimaryButton title="Log in" onPress={login} loading={loading} />
                    <LinkButton text="New here?" link="Create an account" onPress={() => navigation.navigate("Register")} />
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const s = StyleSheet.create({
    scroll: { flexGrow: 1, justifyContent: "center", padding: 22 },
    hero: { alignItems: "center", marginBottom: 26 },
    logo: {
        width: 64, height: 64, borderRadius: 18, backgroundColor: C.accent,
        alignItems: "center", justifyContent: "center", marginBottom: 12,
    },
    logoText: { color: C.bg, fontSize: 32, fontWeight: "bold" },
    brand: { color: C.bg, fontSize: 30, fontWeight: "bold" },
    tagline: { color: "#9fd3e6", marginTop: 6, textAlign: "center" },
    card: { backgroundColor: C.bg, borderRadius: 18, padding: 22, elevation: 6 },
    heading: { fontSize: 22, fontWeight: "bold", color: C.navy, marginBottom: 18 },
});