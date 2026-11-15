import { useState } from "react";
import { View, Text, TextInput, StyleSheet, Alert, TouchableOpacity, Image } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { api } from "../api";
import { C, SHADOW } from "../theme";
import Btn from "../components/Btn";

export default function ScanScreen({ route, navigation }) {
    const { mode } = route.params; // receive | sell | verify | temp
    const [permission, requestPermission] = useCameraPermissions();
    const [uid, setUid] = useState(null);
    const [location, setLocation] = useState("");
    const [quantity, setQuantity] = useState("");
    const [temperature, setTemperature] = useState("");
    const [busy, setBusy] = useState(false);
    const [locked, setLocked] = useState(false);
    const [showManual, setShowManual] = useState(false);
    const [manual, setManual] = useState("");
    const [previewHeight, setPreviewHeight] = useState(0);
    const frameTop = Math.max(0, (previewHeight - 250) / 2);

    if (!permission) return <View />;
    if (!permission.granted) {
        return (
            <View style={s.center}>
                <Image source={require("../../assets/qr-box.png")} style={s.permImg} />
                <Text style={s.msg}>Camera access is needed to scan the QR code on a medicine pack</Text>
                <Btn title="Allow camera" onPress={requestPermission} style={{ alignSelf: "stretch" }} />
            </View>
        );
    }

    const rescan = () => { setUid(null); setLocked(false); };

    const onScan = ({ data }) => {
        if (locked || !data) return;
        setLocked(true);
        if (mode === "verify") navigation.replace("VerifyResult", { batch_uid: data });
        else setUid(data);
    };

    const done = (title, text) =>
        Alert.alert(title, text, [{ text: "OK", onPress: () => navigation.goBack() }]);

    const confirm = async () => {
        if (!location.trim()) return Alert.alert("Missing", "Enter the location");

        let path = "/custody/transfer";
        let body = { batch_uid: uid, location: location.trim() };

        if (mode === "sell") {
            const qty = parseInt(quantity, 10);
            if (!qty || qty <= 0) return Alert.alert("Invalid", "Enter how many units were sold");
            path = "/transactions/";
            body = { batch_uid: uid, quantity: qty, location: location.trim() };
        } else if (mode === "temp") {
            const t = parseFloat(temperature);
            if (isNaN(t)) return Alert.alert("Invalid", "Enter the temperature in °C");
            path = "/coldchain/readings";
            body = { batch_uid: uid, temperature_c: t, location: location.trim(), device_id: "MANUAL-ENTRY" };
        }

        setBusy(true);
        try {
            const res = await api(path, "POST", body);
            if (mode === "sell") done("Recorded", `${res.units_sold} units sold. ${res.units_remaining} left in this batch.`);
            else if (mode === "temp")
                done(res.breach ? "BREACH" : "Saved",
                    res.breach ? `${res.temperature_c}°C is outside ${res.range}. The batch was flagged.`
                        : `${res.temperature_c}°C is within ${res.range}.`);
            else done("Recorded", res.message);
        } catch (e) {
            Alert.alert("Could not record", e.message);
            rescan();
        } finally {
            setBusy(false);
        }
    };

    const simulate = async (breach) => {
        setBusy(true);
        try {
            const res = await api(`/coldchain/simulate/${uid}?breach=${breach}`, "POST");
            done("Simulated sensor", res.message);
        } catch (e) {
            Alert.alert("Could not simulate", e.message);
            rescan();
        } finally {
            setBusy(false);
        }
    };

    if (mode !== "verify" && uid) {
        const label = mode === "sell" ? "Confirm sale" : mode === "temp" ? "Save reading" : "Confirm received";
        return (
            <View style={s.form}>
                <View style={s.card}>
                <Text style={s.title}>{mode === "sell" ? "Record sale" : mode === "temp" ? "Temperature reading" : "Confirm received"}</Text>
                <Text selectable style={s.uid}>Batch: {uid}</Text>
                {mode === "sell" && (
                <TextInput style={s.input} placeholder="Units sold" placeholderTextColor={C.muted} keyboardType="numeric"
                        value={quantity} onChangeText={setQuantity} />
                )}
                {mode === "temp" && (
                <TextInput style={s.input} placeholder="Temperature in °C (e.g. 5.5)" placeholderTextColor={C.muted} keyboardType="numeric"
                        value={temperature} onChangeText={setTemperature} />
                )}
                <TextInput style={s.input} placeholderTextColor={C.muted}
                    placeholder={mode === "temp" ? "Where is the batch now?" : "Your location (e.g. Karachi Hub)"}
                    value={location} onChangeText={setLocation} />
                <Btn title={busy ? "Saving..." : label} onPress={confirm} disabled={busy} />
                {mode === "temp" && (
                    <View style={{ marginTop: 20 }}>
                        <Text style={s.msg}>No sensor connected? Simulate one:</Text>
                        <Btn title="Simulate sensor: normal journey" variant="alt" onPress={() => simulate(false)} disabled={busy} />
                        <Btn title="Simulate sensor: with breach" variant="danger"
                            onPress={() => simulate(true)} disabled={busy} />
                    </View>
                )}
                <View style={{ height: 10 }} />
                <Btn title="Scan again" variant="outline" onPress={rescan} />
                </View>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: "#000" }} onLayout={(e) => setPreviewHeight(e.nativeEvent.layout.height)}>
            <CameraView style={StyleSheet.absoluteFill} facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={onScan} />
            <View style={s.overlay} pointerEvents="none"><View style={[s.frame, { top: frameTop }]}>{[s.tl, s.tr, s.bl, s.br].map((x, i) => <View key={i} style={[s.corner, x]} />)}</View><Text style={[s.hint, { top: frameTop + 265 }]}>Align the QR code within the frame</Text></View>
            <View style={s.manualBox}><Text style={s.or}>Or</Text>{showManual ? <View style={s.manualRow}><TextInput style={s.manualInput} placeholder="Paste the batch ID" placeholderTextColor="#ccc" autoCapitalize="none" value={manual} onChangeText={setManual} onSubmitEditing={() => onScan({ data: manual.trim() })} /><TouchableOpacity style={s.go} onPress={() => onScan({ data: manual.trim() })}><Icon name="arrow-right" size={22} color="#fff" /></TouchableOpacity></View> : <TouchableOpacity style={s.manualBtn} onPress={() => setShowManual(true)}><Icon name="keyboard-outline" size={20} color="#fff" /><Text style={s.manualText}>Enter code manually</Text></TouchableOpacity>}</View>
        </View>
    );
}

const s = StyleSheet.create({
    center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: C.bg },
    permImg: { width: 160, height: 160, borderRadius: 20, marginBottom: 18 },
    msg: { fontSize: 16, marginBottom: 10, textAlign: "center" },
    form: { flex: 1, padding: 18, backgroundColor: C.bg },
    card: { backgroundColor: C.card, borderRadius: 18, padding: 18, ...SHADOW },
    title: { fontSize: 24, fontWeight: "bold", marginBottom: 8 },
    uid: { fontSize: 13, marginBottom: 16 },
    input: { borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, marginBottom: 10, backgroundColor: C.card, color: C.dark },
    overlay: { ...StyleSheet.absoluteFillObject }, frame: { position: "absolute", left: "50%", width: 250, height: 250, marginLeft: -125 }, corner: { position: "absolute", width: 34, height: 34, borderColor: C.accentLight },
    tl: { top: 0, left: 0, borderTopWidth: 5, borderLeftWidth: 5, borderTopLeftRadius: 14 }, tr: { top: 0, right: 0, borderTopWidth: 5, borderRightWidth: 5, borderTopRightRadius: 14 }, bl: { bottom: 0, left: 0, borderBottomWidth: 5, borderLeftWidth: 5, borderBottomLeftRadius: 14 }, br: { bottom: 0, right: 0, borderBottomWidth: 5, borderRightWidth: 5, borderBottomRightRadius: 14 },
    manualBox: { position: "absolute", left: 20, right: 20, bottom: 36, alignItems: "center" }, or: { color: "#fff", marginBottom: 8 }, manualBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(27,67,50,0.9)", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14 }, manualText: { color: "#fff", fontWeight: "600", marginLeft: 8 }, manualRow: { flexDirection: "row", alignSelf: "stretch" }, manualInput: { flex: 1, backgroundColor: "rgba(27,67,50,0.9)", color: "#fff", borderRadius: 12, padding: 12 }, go: { width: 48, marginLeft: 8, borderRadius: 12, backgroundColor: C.accent, alignItems: "center", justifyContent: "center" },
    hint: { position: "absolute", alignSelf: "center", color: "#fff", backgroundColor: "rgba(0,0,0,0.6)", padding: 10, borderRadius: 8 },
});
