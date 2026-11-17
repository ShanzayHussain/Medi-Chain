import { useEffect, useState } from "react";
import {
    View, Text, ScrollView, ActivityIndicator, StyleSheet, TextInput, Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { api } from "../api";
import { C, GRAD, SHADOW } from "../theme";
import Btn from "../components/Btn";

const BAD = ["#7f1d1d", "#b71c1c", "#d32f2f"];
const ROLE_ICON = { manufacturer: "factory", distributor: "truck-delivery-outline", pharmacy: "storefront-outline", customer: "account-outline" };
const EVENT_LABEL = { CREATED: "Manufactured", TRANSFERRED: "Received", SOLD: "Sold" };

export default function VerifyResultScreen({ route, navigation }) {
    const { batch_uid } = route.params;
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [ai, setAi] = useState(null);
    const [aiBusy, setAiBusy] = useState(false);
    const [check, setCheck] = useState(null);
    const [showReport, setShowReport] = useState(false);
    const [note, setNote] = useState("");
    const [sending, setSending] = useState(false);
    const [cfg, setCfg] = useState(null);

    useEffect(() => {
        api(`/custody/verify/${batch_uid}`)
            .then(setData)
            .catch((e) => setError(e.message));
        // runs automatically; a failure here must not break the screen
        api(`/ai/check/${batch_uid}`).then(setCheck).catch(() => { });
        api("/payments/config").then(setCfg).catch(() => { });
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

    const sendReport = async () => {
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
    if (!data) return <ActivityIndicator style={{ marginTop: 60 }} size="large" color={C.primary} />;

    const ok = data.valid && !data.is_expired;
    const intact = data.chain_intact !== false;
    const cc = data.cold_chain;
    const riskColor = { low: C.ok, medium: C.warn, high: C.danger };
    const canBuy = cfg?.can_buy && ok && data.price_pkr > 0 && data.quantity_remaining > 0;
    const checks = [
        { label: "Complete supply chain (manufacturer → distributor → pharmacy)", ok: data.supply_chain_complete === true },
        { label: "Records not tampered with", ok: intact },
        { label: "Not expired", ok: !data.is_expired },
        ...(cc?.required ? [{ label: "Cold chain maintained", ok: cc.status !== "breached" }] : []),
        { label: "No suspicious activity", ok: check ? check.risk_level === "low" : null },
        { label: "Stock not exhausted (QR not reused)", ok: !data.sold_out },
    ];

    return (
        <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={s.pad}>
            <LinearGradient colors={ok ? GRAD : BAD} style={s.hero}><View style={s.shield}><Icon name={ok ? "shield-check" : "shield-alert"} size={64} color="#fff" /></View><Text style={s.bannerText}>{ok ? "Authentic Medicine" : "Do Not Trust This Product"}</Text><Text style={s.bannerSub}>{ok ? "Its recorded supply chain is intact and verified in MediChain." : data.reason}</Text></LinearGradient>

            {/* automatic AI risk check */}
            {check && (
                <View style={[s.checkBox, { borderColor: riskColor[check.risk_level] }]}>
                    <Text style={[s.checkTitle, { color: riskColor[check.risk_level] }]}>
                        AI risk check: {check.risk_level.toUpperCase()}
                    </Text>
                    {check.findings.length === 0 && (
                        <Text style={s.text}>No anomalies detected in this batch's history.</Text>
                    )}
                    {check.findings.map((f, i) => (
                        <Text key={i} style={s.finding}>• {f.reason}</Text>
                    ))}
                </View>
            )}

            <View style={s.card}><Text style={s.drug}>{data.drug_name}</Text><Text style={s.text}>Batch {batch_uid.slice(0, 8)}</Text>
            <Text style={s.text}>Expiry: {data.expiry_date}{data.is_expired ? " (EXPIRED)" : ""}</Text>
            <Text style={s.text}>Units remaining in batch: {data.quantity_remaining} of {data.quantity_total}</Text>
            {data.price_pkr > 0 && <Text style={s.text}>Price: PKR {data.price_pkr} per unit</Text>}
            {canBuy && <Btn title="Buy this medicine" onPress={() => navigation.navigate("Checkout", { batch_uid })} />}</View>

            <View style={s.card}>{checks.map((c) => <View key={c.label} style={s.checkRow}><Icon name={c.ok === null ? "progress-clock" : c.ok ? "check-circle" : "close-circle"} size={22} color={c.ok === null ? C.muted : c.ok ? C.ok : C.danger} /><Text style={s.checkText}>{c.label}</Text></View>)}</View>

            {data.cold_chain?.required && (
                <View style={s.cold}>
                    <Text style={s.coldTitle}>Cold chain (required {data.cold_chain.range})</Text>
                    <Text style={s.text}>
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
                <Btn title={aiBusy ? "Analysing..." : "Explain with AI"} variant="alt" onPress={explain} disabled={aiBusy} style={{ marginTop: 0 }} />
                {ai?.error && <Text style={s.bad}>{ai.error}</Text>}
                {ai && !ai.error && (
                    <View style={{ marginTop: 10 }}>
                        <Text style={s.aiHead}>{ai.headline} ({ai.risk_level} risk)</Text>
                        <Text style={s.text}>{ai.explanation}</Text>
                        {ai.red_flags?.map((f, i) => <Text key={i} style={s.warn}>• {f}</Text>)}
                        {ai.advice?.map((a, i) => <Text key={i} style={s.text}>→ {a}</Text>)}
                        <Text style={s.aiSrc}>
                            {ai.source === "llm" ? "AI explanation (Llama via Groq)" : "Rule-based summary (AI offline)"}
                        </Text>
                    </View>
                )}
            </View>

            {/* report suspicious medicine */}
            <View style={s.reportBox}>
                {!showReport ? (
                    <Btn title="Report suspicious medicine" variant="outline" onPress={() => setShowReport(true)} />
                ) : (
                    <View>
                        <Text style={s.coldTitle}>What looks wrong?</Text>
                        <TextInput
                            style={s.input}
                            placeholder="e.g. packaging looks different, seal was broken"
                            placeholderTextColor={C.muted}
                            multiline
                            value={note}
                            onChangeText={setNote}
                            maxLength={500}
                        />
                        <Btn title={sending ? "Sending..." : "Send report"} onPress={sendReport} disabled={sending} />
                        <Btn title="Cancel" variant="outline" onPress={() => setShowReport(false)} />
                    </View>
                )}
            </View>

            <Text style={s.section}>Supply chain history</Text>
            <View style={s.card}>{data.history.map((h, i) => <View key={i} style={s.tRow}><View style={s.tLeft}><View style={s.tIcon}><Icon name={ROLE_ICON[h.role] || "circle-outline"} size={20} color={C.primary} /></View>{i < data.history.length - 1 && <View style={s.tLine} />}</View><View style={s.tBody}><Text style={s.event}>{EVENT_LABEL[h.event] || h.event} • {h.role}</Text><Text style={s.text}>{h.organization}</Text><Text style={s.small}>{h.location} • {h.timestamp?.slice(0, 16).replace("T", " ")}</Text></View><Icon name={intact ? "check-circle" : "alert-circle"} size={20} color={intact ? C.ok : C.danger} /></View>)}<Text style={s.foot}>{intact ? "All steps verified with hash-chain checking" : "The record of one or more steps does not match its seal"}</Text></View>
        </ScrollView>
    );
}

const s = StyleSheet.create({
    pad: { padding: 16, paddingBottom: 60 },
    text: { color: C.dark },
    banner: { color: "#fff", borderRadius: 20, padding: 22, marginBottom: 14, textAlign: "center" },
    hero: { borderRadius: 20, padding: 22, alignItems: "center", marginBottom: 14 }, shield: { width: 100, height: 100, borderRadius: 50, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
    bannerText: { color: "#fff", fontSize: 22, fontWeight: "bold" },
    bannerSub: { color: "#fff", marginTop: 6, textAlign: "center", opacity: 0.95 },
    card: { backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 12, ...SHADOW },
    checkRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6 }, checkText: { marginLeft: 10, color: C.dark, fontSize: 15, flex: 1 },
    drug: { fontSize: 22, fontWeight: "600", color: C.navy, marginBottom: 6 },
    warn: { color: C.warn, marginTop: 8 },
    section: { fontSize: 18, fontWeight: "bold", color: C.navy, marginTop: 20, marginBottom: 8 },
    row: { backgroundColor: C.card, borderRadius: 8, padding: 12, marginBottom: 8, borderLeftWidth: 4, borderLeftColor: C.accent },
    tRow: { flexDirection: "row", alignItems: "flex-start" }, tLeft: { width: 44, alignItems: "center" }, tIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.tint, alignItems: "center", justifyContent: "center" }, tLine: { width: 2, flex: 1, minHeight: 26, backgroundColor: C.soft, marginVertical: 2 }, tBody: { flex: 1, paddingBottom: 14, paddingRight: 8 }, foot: { textAlign: "center", color: C.muted, fontSize: 12, marginTop: 6 },
    event: { fontWeight: "600", color: C.dark },
    small: { color: C.muted, marginTop: 2 },
    bad: { color: C.danger, fontSize: 16 },
    cold: { backgroundColor: C.tint, borderRadius: 8, padding: 12, marginTop: 10 },
    coldTitle: { fontWeight: "600", color: C.navy, marginBottom: 2 },
    aiBox: { backgroundColor: C.tint, borderRadius: 8, padding: 12, marginTop: 14 },
    aiHead: { fontWeight: "bold", fontSize: 16, color: C.navy, marginBottom: 4 },
    aiSrc: { color: C.muted, fontSize: 12, marginTop: 8 },
    checkBox: { borderWidth: 2, borderRadius: 8, padding: 12, marginBottom: 12, backgroundColor: C.card },
    checkTitle: { fontWeight: "bold", fontSize: 16, marginBottom: 4 },
    finding: { color: C.dark, marginTop: 2 },
    reportBox: { marginTop: 14 },
    input: {
        borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 12, marginVertical: 8,
        minHeight: 70, backgroundColor: C.card, color: C.dark,
    },
});
