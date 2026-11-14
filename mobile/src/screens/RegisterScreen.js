import { useState } from "react";
import {
    View, Text, StyleSheet, Alert, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity,
} from "react-native";
import { api, setToken } from "../api";
import { C } from "../theme";
import { Field, PrimaryButton, LinkButton } from "../components/AuthUI";

const ROLES = [
    { id: "customer", label: "Customer", hint: "Verify medicines" },
    { id: "pharmacy", label: "Pharmacy", hint: "Receive and sell" },
    { id: "distributor", label: "Distributor", hint: "Move batches" },
    { id: "manufacturer", label: "Manufacturer", hint: "Create batches" },
];

export default function RegisterScreen({ navigation }) {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [org, setOrg] = useState("");
    const [role, setRole] = useState("customer");
    const [loading, setLoading] = useState(false);

    const register = async () => {
        if (!name.trim()) return Alert.alert("Missing", "Enter your name");
        if (!/^\S+@\S+\.\S+$/.test(email.trim())) return Alert.alert("Invalid", "Enter a valid email address");
        if (password.length < 6) return Alert.alert("Weak password", "Use at least 6 characters");
        if (role !== "customer" && !org.trim()) return Alert.alert("Missing", "Enter your organization name");

        setLoading(true);
        try {
            const data = await api("/auth/register", "POST", {
                name: name.trim(),
                email: email.trim(),
                password,
                role,
                organization_name: role === "customer" ? null : org.trim(),
            });
            setToken(data.access_token);
            navigation.replace("Home", { role: data.role });
        } catch (e) {
            Alert.alert("Registration failed", e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.navy }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
                <View style={s.hero}>
                    <Text style={s.brand}>Create account</Text>
                    <Text style={s.tagline}>Join the verified pharmaceutical supply chain</Text>
                </View>

                <View style={s.card}>
                    <Text style={s.label}>I am a</Text>
                    <View style={s.roles}>
                        {ROLES.map((r) => (
                            <TouchableOpacity key={r.id} onPress={() => setRole(r.id)}
                                style={[s.role, role === r.id && s.roleActive]}>
                                <Text style={[s.roleTitle, role === r.id && s.roleTitleActive]}>{r.label}</Text>
                                <Text style={[s.roleHint, role === r.id && s.roleHintActive]}>{r.hint}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <Field label="Full name" placeholder="Your name" value={name} onChangeText={setName} />
                    {role !== "customer" && (
                        <Field label="Organization" placeholder="Company or pharmacy name" value={org} onChangeText={setOrg} />
                    )}
                    <Field label="Email" placeholder="you@example.com" autoCapitalize="none"
                        keyboardType="email-address" value={email} onChangeText={setEmail} />
                    <Field label="Password" placeholder="At least 6 characters" secure
                        value={password} onChangeText={setPassword} />

                    <PrimaryButton title="Sign up" onPress={register} loading={loading} />
                    <LinkButton text="Already have an account?" link="Log in" onPress={() => navigation.goBack()} />
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const s = StyleSheet.create({
    scroll: { flexGrow: 1, justifyContent: "center", padding: 22 },
    hero: { alignItems: "center", marginBottom: 20 },
    brand: { color: C.bg, fontSize: 28, fontWeight: "bold" },
    tagline: { color: "#9fd3e6", marginTop: 6, textAlign: "center" },
    card: { backgroundColor: C.bg, borderRadius: 18, padding: 20, elevation: 6 },
    label: { color: C.navy, fontWeight: "600", marginBottom: 8 },
    roles: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 8 },
    role: {
        width: "48.5%", borderWidth: 1, borderColor: C.border, borderRadius: 10,
        padding: 10, marginBottom: 8, backgroundColor: "#f8fafc",
    },
    roleActive: { backgroundColor: C.primary, borderColor: C.primary },
    roleTitle: { fontWeight: "700", color: C.navy },
    roleTitleActive: { color: C.bg },
    roleHint: { color: C.muted, fontSize: 12, marginTop: 2 },
    roleHintActive: { color: "#cfe3f1" },
});