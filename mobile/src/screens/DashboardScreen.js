import { useState, useCallback } from "react";
import {
    View, Text, ScrollView, ActivityIndicator, RefreshControl,
    TouchableOpacity, StyleSheet,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api";

const tagColor = (tag) => {
    if (tag === "expired" || tag === "TAMPERED") return "#c62828";
    if (tag === "sold_out") return "#757575";
    return "#2e7d32";
};

export default function DashboardScreen({ route, navigation }) {
    const { role } = route.params;
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);

    const load = async () => {
        try {
            setError(null);
            setData(await api(`/dashboard/${role}`));
        } catch (e) {
            setError(e.message);
        }
    };

    // reload every time the screen comes back into view
    useFocusEffect(useCallback(() => { load(); }, [role]));

    const onRefresh = async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    };

    if (error) return <View style={s.pad}><Text style={s.err}>{error}</Text></View>;
    if (!data) return <ActivityIndicator style={{ marginTop: 60 }} size="large" />;

    return (
        <ScrollView
            contentContainerStyle={s.pad}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
            <View style={s.grid}>
                {Object.entries(data.summary).map(([label, value]) => (
                    <View key={label} style={s.stat}>
                        <Text style={s.statValue}>{value}</Text>
                        <Text style={s.statLabel}>{label}</Text>
                    </View>
                ))}
            </View>

            {data.sections.map((sec) => (
                <View key={sec.title}>
                    <Text style={s.section}>{sec.title}</Text>
                    {sec.items.length === 0 && <Text style={s.empty}>Nothing here yet</Text>}
                    {sec.items.map((it, i) => (
                        <TouchableOpacity
                            key={i}
                            style={s.row}
                            disabled={!it.batch_uid}
                            onPress={() => navigation.navigate("VerifyResult", { batch_uid: it.batch_uid })}
                        >
                            <View style={{ flex: 1 }}>
                                <Text style={s.rowTitle}>{it.title}</Text>
                                <Text style={s.rowSub}>{it.subtitle}</Text>
                            </View>
                            <Text style={[s.tag, { backgroundColor: tagColor(it.tag) }]}>{it.tag}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            ))}
        </ScrollView>
    );
}

const s = StyleSheet.create({
    pad: { padding: 16, paddingBottom: 60 },
    grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
    stat: { width: "47%", backgroundColor: "#fff", borderRadius: 10, padding: 14, margin: 4, elevation: 2 },
    statValue: { fontSize: 26, fontWeight: "bold" },
    statLabel: { color: "#555", marginTop: 2 },
    section: { fontSize: 18, fontWeight: "bold", marginTop: 20, marginBottom: 8 },
    empty: { color: "#888" },
    row: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 8, padding: 12, marginBottom: 8 },
    rowTitle: { fontWeight: "600", fontSize: 16 },
    rowSub: { color: "#666", marginTop: 2 },
    tag: { color: "#fff", fontSize: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, overflow: "hidden", marginLeft: 8 },
    err: { color: "#c62828", fontSize: 16 },
});