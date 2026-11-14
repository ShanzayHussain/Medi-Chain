import { useLayoutEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { setToken } from "../api";
import { C } from "../theme";
import DashboardScreen from "./DashboardScreen";
import SideMenu from "../components/SideMenu";

const FORECAST = { label: "Demand forecast", screen: "Dashboard", params: { path: "/ai/forecast" } };
const COLD = { label: "Cold chain reading", screen: "Scan", params: { mode: "temp" } };
const RECEIVE = { label: "Scan to receive", screen: "Scan", params: { mode: "receive" } };

const MENU = {
    manufacturer: [
        { label: "Dashboard", home: true, params: { role: "manufacturer" } },
        { label: "Create batch", screen: "CreateBatch" },
        COLD,
        FORECAST,
    ],
    distributor: [
        { label: "Dashboard", home: true, params: { role: "distributor" } },
        RECEIVE,
        COLD,
        FORECAST,
    ],
    pharmacy: [
        { label: "Dashboard", home: true, params: { role: "pharmacy" } },
        RECEIVE,
        { label: "Record sale", screen: "Scan", params: { mode: "sell" } },
        COLD,
        FORECAST,
    ],
    customer: [
        { label: "Scan to verify", home: true, landing: "customer", screen: "Scan", params: { mode: "verify" } },
    ],
    admin: [
        { label: "Admin overview", home: true, params: { role: "admin" } },
        { label: "Flags", screen: "Dashboard", params: { path: "/flags/" } },
        { label: "AI anomaly scan", screen: "Dashboard", params: { path: "/ai/anomalies" } },
        { label: "AI risk report", screen: "Dashboard", params: { path: "/ai/report" } },
        FORECAST,
    ],
};

export default function HomeScreen({ route, navigation }) {
    const { role } = route.params;
    const items = MENU[role] || [];
    const home = items.find((i) => i.home);
    const [open, setOpen] = useState(false);
    const [pasted, setPasted] = useState("");

    useLayoutEffect(() => {
        navigation.setOptions({
            title: "MediChain",
            headerLeft: () => (
                <TouchableOpacity onPress={() => setOpen(true)} style={s.burger}>
                    <Text style={s.burgerText}>☰</Text>
                </TouchableOpacity>
            ),
            headerRight: undefined,
        });
    }, [navigation]);

    const select = (item) => {
        setOpen(false);
        if (item.home && !item.landing) return;
        if (item.screen) navigation.navigate(item.screen, item.params);
    };

    const logout = () => {
        setOpen(false);
        setToken(null);
        navigation.reset({ index: 0, routes: [{ name: "Login" }] });
    };

    return (
        <View style={{ flex: 1, backgroundColor: C.bg }}>
            {home?.landing === "customer" ? (
                <View style={s.welcome}>
                    <Text style={s.title}>Welcome</Text>
                    <Text style={s.sub}>Scan the QR code on a medicine to check that it is genuine.</Text>
                    <TouchableOpacity style={s.scanBtn} onPress={() => navigation.navigate("Scan", { mode: "verify" })}>
                        <Text style={s.scanText}>Scan to verify</Text>
                    </TouchableOpacity>
                    <TextInput style={s.paste} placeholder="Or paste a batch ID" placeholderTextColor={C.muted}
                        autoCapitalize="none" value={pasted} onChangeText={setPasted}
                        onSubmitEditing={() => pasted.trim() && navigation.navigate("VerifyResult", { batch_uid: pasted.trim() })} />
                </View>
            ) : (
                home && <DashboardScreen route={{ params: home.params }} navigation={navigation} />
            )}

            <SideMenu
                open={open}
                onClose={() => setOpen(false)}
                role={role}
                items={items}
                onSelect={select}
                onLogout={logout}
            />
        </View>
    );
}

const s = StyleSheet.create({
    burger: { paddingHorizontal: 12, paddingVertical: 4 },
    burgerText: { color: C.bg, fontSize: 26 },
    welcome: { flex: 1, justifyContent: "center", padding: 28 },
    title: { fontSize: 28, fontWeight: "bold", color: C.navy, marginBottom: 8 },
    sub: { fontSize: 16, color: C.muted, marginBottom: 28 },
    scanBtn: { backgroundColor: C.primary, borderRadius: 12, padding: 18, alignItems: "center" },
    scanText: { color: C.bg, fontSize: 18, fontWeight: "600" },
    paste: { borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, marginTop: 16, backgroundColor: C.card, color: C.dark },
});
