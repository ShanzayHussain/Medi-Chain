import { useState } from "react";
import { View, Text, TextInput, Button, StyleSheet, Alert, ScrollView } from "react-native";
import { api, setToken } from "../api";

const ROLES = ["manufacturer", "distributor", "pharmacy", "customer"];

export default function RegisterScreen({ navigation }) {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [org, setOrg] = useState("");
    const [role, setRole] = useState("customer");

    const register = async () => {
        try {
            const data = await api("/auth/register", "POST", {
                name,
                email,
                password,
                role,
                organization_name: role === "customer" ? null : org,
            });
            setToken(data.access_token);
            navigation.replace("Home", { role: data.role });
        } catch (e) {
            Alert.alert("Registration failed", e.message);
        }
    };

    return (
        <ScrollView contentContainerStyle={s.container}>
            <Text style={s.title}>Create account</Text>
            <TextInput style={s.input} placeholder="Name" value={name} onChangeText={setName} />
            <TextInput style={s.input} placeholder="Email" autoCapitalize="none" value={email} onChangeText={setEmail} />
            <TextInput style={s.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />

            <Text style={s.label}>I am a:</Text>
            <View style={s.roles}>
                {ROLES.map((r) => (
                    <Text key={r} onPress={() => setRole(r)} style={[s.chip, role === r && s.chipActive]}>
                        {r}
                    </Text>
                ))}
            </View>

            {role !== "customer" && (
                <TextInput style={s.input} placeholder="Organization name" value={org} onChangeText={setOrg} />
            )}

            <Button title="Sign up" onPress={register} />
        </ScrollView>
    );
}

const s = StyleSheet.create({
    container: { flexGrow: 1, justifyContent: "center", padding: 24 },
    title: { fontSize: 28, fontWeight: "bold", marginBottom: 20, textAlign: "center" },
    input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, marginBottom: 12 },
    label: { marginBottom: 8, fontWeight: "600" },
    roles: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12 },
    chip: { borderWidth: 1, borderColor: "#999", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8, marginBottom: 8, overflow: "hidden" },
    chipActive: { backgroundColor: "#2196F3", color: "#fff", borderColor: "#2196F3" },
});