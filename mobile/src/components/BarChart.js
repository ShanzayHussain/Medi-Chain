import { View, Text, StyleSheet } from "react-native";
import { C } from "../theme";

export default function BarChart({ title, data }) {
    const max = Math.max(1, ...data.map((d) => d.value));
    return (
        <View style={s.card}>
            <Text style={s.title}>{title}</Text>
            {data.length === 0 && <Text style={s.empty}>No data yet</Text>}
            {data.map((d, i) => (
                <View key={i} style={s.row}>
                    <Text style={s.label} numberOfLines={1}>{d.label}</Text>
                    <View style={s.track}>
                        <View style={[s.bar, { width: `${(d.value / max) * 100}%` }]} />
                    </View>
                    <Text style={s.value}>{d.value}</Text>
                </View>
            ))}
        </View>
    );
}

const s = StyleSheet.create({
    card: { backgroundColor: C.card, borderRadius: 12, padding: 14, marginTop: 14, elevation: 2 },
    title: { fontWeight: "bold", fontSize: 16, color: C.navy, marginBottom: 10 },
    empty: { color: C.muted },
    row: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
    label: { width: 92, color: C.dark, fontSize: 13 },
    track: { flex: 1, height: 14, backgroundColor: "#e8eef5", borderRadius: 7, overflow: "hidden" },
    bar: { height: 14, backgroundColor: C.accent, borderRadius: 7 },
    value: { width: 46, textAlign: "right", color: C.navy, fontWeight: "600" },
});