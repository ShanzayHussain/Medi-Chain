import { useEffect, useState } from "react";
import {
    View, Text, ScrollView, ActivityIndicator, StyleSheet, Button, TextInput, Alert,
} from "react-native";
import { api } from "../api";
import { C } from "../theme";

export default function VerifyResultScreen({ route }) {
    const { batch_uid } = route.params;
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [ai, setAi] = useState(null);
    const [aiBusy, setAiBusy] = useState(false);
    const [check, setCheck] = useState(null);          // NEW: automatic AI check
    const [showReport, setShowReport] = useState(false); // NEW: report form
    const [note, setNote] = useState("");
    const [sending, setSending] = useState(false);

    useEffect(() => {
        api(`/custody/verify/${batch_uid}`)
            .then(setData)
            .catch((e) => setError(e.message));
        // NEW: runs automatically; a failure here must not break the screen
        api(`/ai/check/${batch_uid}`).then(setCheck).catch(() => { });
    }, [batch_uid]);

    const explain = async () => {
        setAiBusy(true);
        try {
            setAi(await api(`/ai/explain/${batch_uid}`));
        } catch (e) {
            setAi({ error: e.message });
        } finally {
            setAiBusy(false);
        }
    };

    const sendReport = async () => {                   // NEW
        if (note.trim().length < 5) return Alert.alert("Too short", "Please describe what looks wrong");
        setSending(true);
        try {
            const res = await api("/ai/report-suspicious", "POST", { batch_uid, note: note.trim() });
            Alert.alert("Thank you", `${res.message}\nCategory: ${res.category} (${res.severity})`);
            setNote("");
            setShowReport(false);
        } catch (e) {
            Alert.alert("Could not send", e.message);
        } finally {
            setSending(false);
        }
    };

    if (error) return <View style={s.pad}><Text style={s.bad}>Not found: {error}</Text></View>;
    if (!data) return <ActivityIndicator style={{ marginTop: 60 }} size="large" />;

    const ok = data.valid && !data.is_expired;
    const riskColor = { low: "#2e7d32", medium: "#e65100", high: "#c62828" };

    return (
        <ScrollView contentContainerStyle={s.pad}>
            <View style={[s.banner, { backgroundColor: ok ? "#2e7d32" : "#c62828" }]}>
                <Text style={s.bannerText}>
                    {ok ? "Verified genuine" : "Do not trust this product"}
                </Text>
                {!ok && <Text style={s.bannerSub}>{data.reason}</Text>}
            </View>

            {/* NEW: automatic AI risk check */}
            {check && (
                <View style={[s.checkBox, { borderColor: riskColor[check.risk_level] }]}>
                    <Text style={[s.checkTitle, { color: riskColor[check.risk_level] }]}>
                        AI risk check: {check.risk_level.toUpperCase()}
                    </Text>
                    {check.findings.length === 0 && <Text>No anomalies detected in this batch's history.</Text>}
                    {check.findings.map((f, i) => (
                        <Text key={i} style={s.finding}>• {f.reason}</Text>
                    ))}
                </View>
            )}

            <Text style={s.drug}>{data.drug_name}</Text>
            <Text>Expiry: {data.expiry_date}{data.is_expired ? " (EXPIRED)" : ""}</Text>
            <Text>Units remaining in batch: {data.quantity_remaining} of {data.quantity_total}</Text>
            {data.cold_chain?.required && (
                <View style={s.cold}>
                    <Text style={s.coldTitle}>Cold chain (required {data.cold_chain.range})</Text>
                    <Text>
                        {data.cold_chain.status === "no_data"
                            ? "No temperature readings yet"
                            : `${data.cold_chain.readings} readings, last ${data.cold_chain.last_temp}°C`}
                    </Text>
                    {data.cold_chain.breaches > 0 && (
                        <Text style={s.bad}>{data.cold_chain.breaches} reading(s) out of range</Text>
                    )}
                </View>
            )}
            {data.warning && <Text style={s.warn}>{data.warning}</Text>}

            <View style={s.aiBox}>
                <Button title={aiBusy ? "Analysing..." : "Explain with AI"} onPress={explain} disabled={aiBusy} />
                {ai?.error && <Text style={s.bad}>{ai.error}</Text>}
                {ai && !ai.error && (
                    <View style={{ marginTop: 10 }}>
                        <Text style={s.aiHead}>{ai.headline} ({ai.risk_level} risk)</Text>
                        <Text>{ai.explanation}</Text>
                        {ai.red_flags?.map((f, i) => <Text key={i} style={s.warn}>• {f}</Text>)}
                        {ai.advice?.map((a, i) => <Text key={i}>→ {a}</Text>)}
                        <Text style={s.aiSrc}>
                            {ai.source === "llm" ? "AI explanation (Llama via Groq)" : "Rule-based summary (AI offline)"}
                        </Text>
                    </View>
                )}
            </View>

            {/* NEW: report suspicious medicine */}
            <View style={s.reportBox}>
                {!showReport ? (
                    <Button title="Report suspicious medicine" color="#c62828" onPress={() => setShowReport(true)} />
                ) : (
                    <View>
                        <Text style={s.coldTitle}>What looks wrong?</Text>
                        <TextInput
                            style={s.input}
                            placeholder="e.g. packaging looks different, seal was broken"
                            multiline
                            value={note}
                            onChangeText={setNote}
                            maxLength={500}
                        />
                        <Button title={sending ? "Sending..." : "Send report"} onPress={sendReport} disabled={sending} />
                        <View style={{ height: 8 }} />
                        <Button title="Cancel" onPress={() => setShowReport(false)} />
                    </View>
                )}
            </View>

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
    banner: { borderRadius: 10, padding: 18, marginBottom: 12 },
    bannerText: { color: "#fff", fontSize: 22, fontWeight: "bold" },
    bannerSub: { color: "#fff", marginTop: 4 },
    drug: { fontSize: 22, fontWeight: "600", marginBottom: 6 },
    warn: { color: "#e65100", marginTop: 8 },
    section: { fontSize: 18, fontWeight: "bold", marginTop: 20, marginBottom: 8 },
    row: { backgroundColor: "#fff", borderRadius: 8, padding: 12, marginBottom: 8 },
    event: { fontWeight: "600" },
    small: { color: "#666", marginTop: 2 },
    bad: { color: "#c62828", fontSize: 16 },
    cold: { backgroundColor: "#e3f2fd", borderRadius: 8, padding: 12, marginTop: 10 },
    coldTitle: { fontWeight: "600", marginBottom: 2 },
    aiBox: { backgroundColor: "#f3e5f5", borderRadius: 8, padding: 12, marginTop: 14 },
    aiHead: { fontWeight: "bold", fontSize: 16, marginBottom: 4 },
    aiSrc: { color: "#777", fontSize: 12, marginTop: 8 },
    checkBox: { borderWidth: 2, borderRadius: 8, padding: 12, marginBottom: 12, backgroundColor: "#fff" },
    checkTitle: { fontWeight: "bold", fontSize: 16, marginBottom: 4 },
    finding: { color: "#444", marginTop: 2 },
    reportBox: { marginTop: 14 },
    input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, marginVertical: 8, minHeight: 70, backgroundColor: "#fff" },
});