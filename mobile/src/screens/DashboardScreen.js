import { useState, useCallback } from "react";
import {
    View, Text, ScrollView, ActivityIndicator, RefreshControl,
    TouchableOpacity, StyleSheet,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api";
import { C } from "../theme";
import BarChart from "../components/BarChart";

const tagColor = (tag) => {
    if (["expired", "TAMPERED", "high", "shortage", "open"].includes(tag)) return C.danger;
    if (["medium", "low"].includes(tag)) return C.warn;
    if (["sold_out", "resolved", "no_sales", "info"].includes(tag)) return "#757575";
    return C.ok;
};

export default function DashboardScreen({ route, navigation }) {
    const { role, path } = route.params;
    const endpoint = path || `/dashboard/${role}`;
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);

    const load = async () => {
        try {
            setError(null);
            setData(await api(endpoint));
        } catch (e) {
            setError(e.message);
        }
    };

    useFocusEffect(useCallback(() => { load(); }, [endpoint]));

    const onRefresh = async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    };

    if (error) return <View style={s.pad}><Text style={s.err}>{error}</Text></View>;
    if (!data) return <ActivityIndicator style={{ marginTop: 60 }} size="large" color={C.primary} />;

    return (
        <ScrollView
            style={{ backgroundColor: C.bg }}
            contentContainerStyle={s.pad}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
            <View style={s.grid}>
                {Object.entries(data.summary).map(([label, value], i) => (
                    <View key={label} style={[s.stat, i % 2 === 0 ? s.statDark : s.statMid]}>
                        <Text style={s.statValue}>{String(value)}</Text>
                        <Text style={s.statLabel}>{label}</Text>
                    </View>
                ))}
            </View>

            {data.charts?.map((c) => <BarChart key={c.title} title={c.title} data={c.data} />)}

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
    stat: { width: "47%", borderRadius: 12, padding: 14, margin: 4 },
    statDark: { backgroundColor: C.navy },
    statMid: { backgroundColor: C.primary },
    statValue: { fontSize: 26, fontWeight: "bold", color: C.bg },
    statLabel: { color: "#cfe3f1", marginTop: 2 },
    section: { fontSize: 18, fontWeight: "bold", color: C.navy, marginTop: 22, marginBottom: 8 },
    empty: { color: C.muted },
    row: {
        flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: 10,
        padding: 12, marginBottom: 8, borderLeftWidth: 4, borderLeftColor: C.accent,
    },
    rowTitle: { fontWeight: "600", fontSize: 16, color: C.dark },
    rowSub: { color: C.muted, marginTop: 2 },
    tag: { color: "#fff", fontSize: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, overflow: "hidden", marginLeft: 8 },
    err: { color: C.danger, fontSize: 16 },
});