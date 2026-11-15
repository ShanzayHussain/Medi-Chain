import { useState, useCallback } from "react";
import {
    View, Text, ScrollView, ActivityIndicator, RefreshControl,
    TouchableOpacity, StyleSheet, ImageBackground,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api";
import { C, GRAD, SHADOW } from "../theme";
import BarChart from "../components/BarChart";

const tagColor = (tag) => {
    if (["expired", "TAMPERED", "high", "shortage", "open", "failed"].includes(tag)) return C.danger;
    if (["medium", "low", "pending"].includes(tag)) return C.warn;
    if (["sold_out", "resolved", "no_sales", "info"].includes(tag)) return "#757575";
    return C.ok;
};

const ROLE_CONTENT = {
    manufacturer: {
        title: "Create trusted batches",
        subtitle: "Register each medicine batch and follow its journey through the supply chain.",
        actions: [{ label: "Create batch", icon: "plus-box-outline", screen: "CreateBatch" }, { label: "Cold chain", icon: "thermometer", screen: "Scan", params: { mode: "temp" } }, { label: "Demand forecast", icon: "chart-line", screen: "Dashboard", params: { path: "/ai/forecast" } }],
    },
    distributor: {
        title: "Keep stock moving safely",
        subtitle: "Receive batches, record handling conditions and keep every handover traceable.",
        actions: [{ label: "Receive stock", icon: "truck-delivery-outline", screen: "Scan", params: { mode: "receive" } }, { label: "Cold chain", icon: "thermometer", screen: "Scan", params: { mode: "temp" } }, { label: "Demand forecast", icon: "chart-line", screen: "Dashboard", params: { path: "/ai/forecast" } }],
    },
    pharmacy: {
        title: "Manage pharmacy stock",
        subtitle: "Receive verified batches, record sales and track your payment activity.",
        actions: [{ label: "Receive stock", icon: "truck-delivery-outline", screen: "Scan", params: { mode: "receive" } }, { label: "Record sale", icon: "cash-register", screen: "Scan", params: { mode: "sell" } }, { label: "Payments", icon: "credit-card-outline", screen: "Dashboard", params: { path: "/payments/orders" } }, { label: "Cold chain", icon: "thermometer", screen: "Scan", params: { mode: "temp" } }],
    },
    admin: {
        title: "Supply chain overview",
        subtitle: "Review system activity, investigate risk signals and monitor medicine movement.",
        actions: [{ label: "Flags", icon: "flag-outline", screen: "Dashboard", params: { path: "/flags/" } }, { label: "Anomaly scan", icon: "shield-alert-outline", screen: "Dashboard", params: { path: "/ai/anomalies" } }, { label: "Risk report", icon: "file-chart-outline", screen: "Dashboard", params: { path: "/ai/report" } }, { label: "Payments", icon: "credit-card-outline", screen: "Dashboard", params: { path: "/payments/orders" } }],
    },
};

export default function DashboardScreen({ route, navigation }) {
    const { role, path } = route.params;
    const endpoint = path || `/dashboard/${role}`;
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const content = !path && ROLE_CONTENT[role];
    const isForecast = path === "/ai/forecast";

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
            {isForecast && <ImageBackground source={require("../../assets/vials.png")} style={s.forecastHero} imageStyle={{ borderRadius: 18 }}>
                <LinearGradient colors={["rgba(27,67,50,0.96)", "rgba(27,67,50,0.78)", "rgba(27,67,50,0.15)"]} locations={[0, 0.62, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[StyleSheet.absoluteFill, { borderRadius: 18 }]} />
                <View style={s.forecastCopy}><View style={s.forecastLabel}><Icon name="chart-line" size={16} color={C.soft} /><Text style={s.kicker}>DEMAND PLANNING</Text></View><Text style={s.heroTitle}>Demand forecast</Text><Text style={s.heroSub}>Estimated medicine demand for the next seven days, with current stock and shortage signals.</Text></View>
            </ImageBackground>}
            {content && <>
                <View style={s.brandRow}><LinearGradient colors={GRAD} style={s.logo}><Icon name="shield-check" size={26} color="#fff" /></LinearGradient><View style={{ marginLeft: 10 }}><Text style={s.brand}>MediChain</Text><Text style={s.brandTag}>Trusted Medicine. Transparent Supply.</Text></View></View>
                <ImageBackground source={require("../../assets/shield-pills.png")} style={s.hero} imageStyle={{ borderRadius: 18 }}>
                    <LinearGradient colors={["rgba(27,67,50,0.96)", "rgba(27,67,50,0.78)", "rgba(27,67,50,0.12)"]} locations={[0, 0.58, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[StyleSheet.absoluteFill, { borderRadius: 18 }]} />
                    <View style={s.heroCopy}><Text style={s.kicker}>{role.toUpperCase()} WORKSPACE</Text><Text style={s.heroTitle}>{content.title}</Text><Text style={s.heroSub}>{content.subtitle}</Text></View>
                </ImageBackground>
                <Text style={s.section}>Quick actions</Text>
                <View style={s.actionGrid}>{content.actions.map((a) => <TouchableOpacity key={a.label} style={s.action} activeOpacity={0.85} onPress={() => navigation.navigate(a.screen, a.params)}><View style={s.actionIcon}><Icon name={a.icon} size={25} color={C.primary} /></View><Text style={s.actionText}>{a.label}</Text><Icon name="chevron-right" size={18} color={C.accent} /></TouchableOpacity>)}</View>
                <Text style={s.section}>Your overview</Text>
            </>}
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
                <View key={sec.title} style={isForecast ? s.forecastSection : undefined}>
                    <View style={isForecast ? s.sectionHead : undefined}><Text style={[s.section, isForecast && s.forecastSectionTitle]}>{sec.title}</Text>{isForecast && <Text style={s.count}>{sec.items.length}</Text>}</View>
                    {sec.items.length === 0 && <Text style={s.empty}>Nothing here yet</Text>}
                    {sec.items.map((it, i) => (
                        <TouchableOpacity
                            key={i}
                            style={s.row}
                            disabled={!it.batch_uid}
                            onPress={() => navigation.navigate("VerifyResult", { batch_uid: it.batch_uid })}
                        >
                            {isForecast && <View style={[s.forecastIcon, { backgroundColor: tagColor(it.tag) + "18" }]}><Icon name={it.tag === "shortage" ? "alert-outline" : it.tag === "low" ? "trending-down" : "pill"} size={21} color={tagColor(it.tag)} /></View>}
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
    pad: { padding: 18, paddingBottom: 60 },
    brandRow: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
    logo: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    brand: { fontSize: 22, fontWeight: "bold", color: C.navy },
    brandTag: { color: C.muted, fontSize: 12 },
    hero: { borderRadius: 18, padding: 18, minHeight: 175, justifyContent: "center", overflow: "hidden" },
    heroCopy: { width: "75%" }, kicker: { color: C.soft, fontWeight: "700", fontSize: 11, letterSpacing: 0.6 },
    heroTitle: { color: "#fff", fontSize: 23, fontWeight: "bold", marginTop: 5 },
    heroSub: { color: C.onDark, marginTop: 6, fontSize: 13 },
    actionGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
    action: { width: "48%", minHeight: 88, flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: 15, padding: 11, marginBottom: 10, ...SHADOW },
    actionIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.tint, alignItems: "center", justifyContent: "center", marginRight: 8 },
    actionText: { flex: 1, color: C.navy, fontSize: 13, fontWeight: "700" },
    forecastHero: { borderRadius: 18, padding: 20, minHeight: 180, justifyContent: "center", overflow: "hidden", marginBottom: 18 },
    forecastCopy: { width: "78%" }, forecastLabel: { flexDirection: "row", alignItems: "center", gap: 6 }, kicker: { color: C.soft, fontWeight: "700", fontSize: 11, letterSpacing: 0.7 },
    heroTitle: { color: "#fff", fontSize: 25, fontWeight: "bold", marginTop: 8 }, heroSub: { color: C.onDark, fontSize: 13, marginTop: 6, lineHeight: 19 },
    forecastSection: { backgroundColor: C.card, borderRadius: 16, padding: 14, marginTop: 10, ...SHADOW },
    sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    forecastSectionTitle: { marginTop: 0, marginBottom: 10, fontSize: 16 },
    count: { color: C.primary, backgroundColor: C.tint, overflow: "hidden", borderRadius: 12, minWidth: 28, textAlign: "center", paddingHorizontal: 8, paddingVertical: 3, fontWeight: "700" },
    forecastIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", marginRight: 10 },
    grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
    stat: { width: "47%", borderRadius: 16, padding: 14, margin: 4, ...SHADOW },
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
