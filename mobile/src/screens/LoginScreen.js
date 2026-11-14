import { useState } from "react";
import { View, Text, TextInput, Button, StyleSheet, Alert } from "react-native";
import { api, setToken } from "../api";
import { C } from "../theme";

export default function LoginScreen({ navigation }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const login = async () => {
        try {
            const data = await api("/auth/login", "POST", { email, password });
            setToken(data.access_token);
            navigation.replace("Home", { role: data.role });
        } catch (e) {
            Alert.alert("Login failed", e.message);
        }
    };

    return (
        <View style={s.container}>
            <Text style={s.title}>MediChain</Text>
            <TextInput style={s.input} placeholder="Email" autoCapitalize="none"
                value={email} onChangeText={setEmail} />
            <TextInput style={s.input} placeholder="Password" secureTextEntry
                value={password} onChangeText={setPassword} />
            <Button title="Log in" onPress={login} />
            <Button title="Create new account" onPress={() => navigation.navigate("Register")} />
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, justifyContent: "center", padding: 24 },
    title: { fontSize: 32, fontWeight: "bold", marginBottom: 24, textAlign: "center" },
    input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, marginBottom: 12 },
});