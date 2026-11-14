import { useLayoutEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, Button } from "react-native";
import { setToken } from "../api";

// screen: name of the real screen to open. null = not built yet
const MENU = {
    manufacturer: [
        { label: "Create batch", screen: "CreateBatch" },
        { label: "My batches", screen: "Dashboard", params: { role: "manufacturer" } },
    ],
    distributor: [
        { label: "Scan to receive", screen: "Scan", params: { mode: "receive" } },
        { label: "My inventory", screen: "Dashboard", params: { role: "distributor" } },
    ],
    pharmacy: [
        { label: "Scan to receive", screen: "Scan", params: { mode: "receive" } },
        { label: "Record sale", screen: "Scan", params: { mode: "sell" } },
        { label: "Stock", screen: "Dashboard", params: { role: "pharmacy" } },
    ],
    customer: [{ label: "Scan to verify", screen: "Scan", params: { mode: "verify" } }],
    admin: [
        { label: "Admin overview", screen: "Dashboard", params: { role: "admin" } },
    ],
};

export default function HomeScreen({ route, navigation }) {
    const { role } = route.params;
    useLayoutEffect(() => {
        navigation.setOptions({
            headerRight: () => (
                <Button
                    title="Log out"
                    onPress={() => {
                        setToken(null);
                        navigation.reset({ index: 0, routes: [{ name: "Login" }] });
                    }}
                />
            ),
        });
    }, [navigation]);

    const open = (item) => {
        if (item.screen) navigation.navigate(item.screen, item.params);
        else Alert.alert("Coming soon", `${item.label} is not built yet`);
    };

    return (
        <View style={s.container}>
            <Text style={s.title}>Logged in as {role}</Text>
            {(MENU[role] || []).map((item) => (
                <TouchableOpacity key={item.label} style={s.card} onPress={() => open(item)}>
                    <Text style={s.cardText}>{item.label}</Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, padding: 24, paddingTop: 40 },
    title: { fontSize: 22, fontWeight: "bold", marginBottom: 20 },
    card: { backgroundColor: "#fff", borderRadius: 10, padding: 18, marginBottom: 12, elevation: 2 },
    cardText: { fontSize: 18 },
});