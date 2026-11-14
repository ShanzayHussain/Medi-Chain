import { useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { api } from "../api";

export default function VerifyResultScreen({ route }) {
    const { batch_uid } = route.params;
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        api(`/custody/verify/${batch_uid}`)
            .then(setData)
            .catch((e) => setError(e.message));
    }, [batch_uid]);

    if (error) return <View style={s.pad}><Text style={s.bad}>Not found: {error}</Text></View>;
    if (!data) return <ActivityIndicator style={{ marginTop: 60 }} size="large" />;

    const ok = data.valid && !data.is_expired;

    return (
        <ScrollView contentContainerStyle={s.pad}>
            <View style={[s.banner, { backgroundColor: ok ? "#2e7d32" : "#c62828" }]}>
                <Text style={s.bannerText}>
                    {ok ? "Verified genuine" : "Do not trust this product"}
                </Text>
                {!ok && <Text style={s.bannerSub}>{data.reason}</Text>}
            </View>

            <Text style={s.drug}>{data.drug_name}</Text>
            <Text>Expiry: {data.expiry_date}{data.is_expired ? " (EXPIRED)" : ""}</Text>
            <Text>Units remaining in batch: {data.quantity_remaining} of {data.quantity_total}</Text>
            {data.warning && <Text style={s.warn}>{data.warning}</Text>}

            <Text style={s.section}>Supply chain history</Text>
            {data.history.map((h, i) => (
                <View key={i} style={s.row}>
                    <Text style={s.event}>{i + 1}. {h.event} — {h.organization} ({h.role})</Text>
                    <Text style={s.small}>{h.location} • {h.timestamp?.slice(0, 16).replace("T", " ")}</Text>
                </View>
            ))}
        </ScrollView>
    );
}

const s = StyleSheet.create({
    pad: { padding: 20, paddingBottom: 60 },
    banner: { borderRadius: 10, padding: 18, marginBottom: 16 },
    bannerText: { color: "#fff", fontSize: 22, fontWeight: "bold" },
    bannerSub: { color: "#fff", marginTop: 4 },
    drug: { fontSize: 22, fontWeight: "600", marginBottom: 6 },
    warn: { color: "#e65100", marginTop: 8 },
    section: { fontSize: 18, fontWeight: "bold", marginTop: 20, marginBottom: 8 },
    row: { backgroundColor: "#fff", borderRadius: 8, padding: 12, marginBottom: 8 },
    event: { fontWeight: "600" },
    small: { color: "#666", marginTop: 2 },
    bad: { color: "#c62828", fontSize: 16 },
});