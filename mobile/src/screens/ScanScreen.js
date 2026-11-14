import { useState } from "react";
import { View, Text, TextInput, Button, StyleSheet, Alert } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { api } from "../api";
import { C } from "../theme";

export default function ScanScreen({ route, navigation }) {
    const { mode } = route.params; // receive | sell | verify | temp
    const [permission, requestPermission] = useCameraPermissions();
    const [uid, setUid] = useState(null);
    const [location, setLocation] = useState("");
    const [quantity, setQuantity] = useState("");
    const [temperature, setTemperature] = useState("");
    const [busy, setBusy] = useState(false);
    const [locked, setLocked] = useState(false);

    if (!permission) return <View />;
    if (!permission.granted) {
        return (
            <View style={s.center}>
                <Text style={s.msg}>Camera permission is needed to scan QR codes</Text>
                <Button title="Allow camera" onPress={requestPermission} />
            </View>
        );
    }

    const rescan = () => { setUid(null); setLocked(false); };

    const onScan = ({ data }) => {
        if (locked) return;
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
                <Text style={s.title}>Batch scanned</Text>
                <Text selectable style={s.uid}>{uid}</Text>
                {mode === "sell" && (
                    <TextInput style={s.input} placeholder="Units sold" keyboardType="numeric"
                        value={quantity} onChangeText={setQuantity} />
                )}
                {mode === "temp" && (
                    <TextInput style={s.input} placeholder="Temperature in °C (e.g. 5.5)" keyboardType="numeric"
                        value={temperature} onChangeText={setTemperature} />
                )}
                <TextInput style={s.input}
                    placeholder={mode === "temp" ? "Where is the batch now?" : "Your location (e.g. Karachi Hub)"}
                    value={location} onChangeText={setLocation} />
                <Button title={busy ? "Saving..." : label} onPress={confirm} disabled={busy} />
                {mode === "temp" && (
                    <View style={{ marginTop: 20 }}>
                        <Text style={s.msg}>No sensor connected? Simulate one:</Text>
                        <Button title="Simulate sensor: normal journey" onPress={() => simulate(false)} disabled={busy} />
                        <View style={{ height: 10 }} />
                        <Button title="Simulate sensor: with temperature breach" color="#c62828"
                            onPress={() => simulate(true)} disabled={busy} />
                    </View>
                )}
                <View style={{ height: 10 }} />
                <Button title="Scan again" onPress={rescan} />
            </View>
        );
    }

    return (
        <View style={{ flex: 1 }}>
            <CameraView style={{ flex: 1 }} facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={onScan} />
            <Text style={s.hint}>Point the camera at the batch QR code</Text>
        </View>
    );
}

const s = StyleSheet.create({
    center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
    msg: { fontSize: 16, marginBottom: 10, textAlign: "center" },
    form: { padding: 24 },
    title: { fontSize: 24, fontWeight: "bold", marginBottom: 8 },
    uid: { fontSize: 13, marginBottom: 16 },
    input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, marginBottom: 12 },
    hint: {
        position: "absolute", bottom: 40, alignSelf: "center", color: "#fff",
        backgroundColor: "rgba(0,0,0,0.6)", padding: 10, borderRadius: 8
    },
});