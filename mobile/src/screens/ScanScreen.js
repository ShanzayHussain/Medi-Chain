import { useState } from "react";
import { View, Text, TextInput, Button, StyleSheet, Alert } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { api } from "../api";

export default function ScanScreen({ route, navigation }) {
    const { mode } = route.params; // "receive", "sell" or "verify"
    const [permission, requestPermission] = useCameraPermissions();
    const [uid, setUid] = useState(null);
    const [location, setLocation] = useState("");
    const [quantity, setQuantity] = useState("");
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

    const rescan = () => {
        setUid(null);
        setLocked(false);
    };

    const onScan = ({ data }) => {
        if (locked) return;
        setLocked(true);
        if (mode === "verify") {
            navigation.replace("VerifyResult", { batch_uid: data });
        } else {
            setUid(data);
        }
    };

    const confirm = async () => {
        if (!location.trim()) return Alert.alert("Missing", "Enter your location");

        let path = "/custody/transfer";
        let body = { batch_uid: uid, location: location.trim() };

        if (mode === "sell") {
            const qty = parseInt(quantity, 10);
            if (!qty || qty <= 0) return Alert.alert("Invalid", "Enter how many units were sold");
            path = "/transactions/";
            body = { batch_uid: uid, quantity: qty, location: location.trim() };
        }

        setBusy(true);
        try {
            const res = await api(path, "POST", body);
            const text =
                mode === "sell"
                    ? `${res.units_sold} units sold. ${res.units_remaining} left in this batch.`
                    : res.message;
            Alert.alert("Recorded", text, [{ text: "OK", onPress: () => navigation.goBack() }]);
        } catch (e) {
            Alert.alert("Could not record", e.message);
            rescan();
        } finally {
            setBusy(false);
        }
    };

    if (mode !== "verify" && uid) {
        return (
            <View style={s.form}>
                <Text style={s.title}>Batch scanned</Text>
                <Text selectable style={s.uid}>{uid}</Text>
                {mode === "sell" && (
                    <TextInput
                        style={s.input}
                        placeholder="Units sold"
                        keyboardType="numeric"
                        value={quantity}
                        onChangeText={setQuantity}
                    />
                )}
                <TextInput
                    style={s.input}
                    placeholder={mode === "sell" ? "Pharmacy / shop location" : "Your location (e.g. Karachi Hub)"}
                    value={location}
                    onChangeText={setLocation}
                />
                <Button
                    title={busy ? "Saving..." : mode === "sell" ? "Confirm sale" : "Confirm received"}
                    onPress={confirm}
                    disabled={busy}
                />
                <View style={{ height: 10 }} />
                <Button title="Scan again" onPress={rescan} />
            </View>
        );
    }

    return (
        <View style={{ flex: 1 }}>
            <CameraView
                style={{ flex: 1 }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={onScan}
            />
            <Text style={s.hint}>Point the camera at the batch QR code</Text>
        </View>
    );
}

const s = StyleSheet.create({
    center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
    msg: { fontSize: 16, marginBottom: 16, textAlign: "center" },
    form: { padding: 24 },
    title: { fontSize: 24, fontWeight: "bold", marginBottom: 8 },
    uid: { fontSize: 13, marginBottom: 16 },
    input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, marginBottom: 12 },
    hint: {
        position: "absolute", bottom: 40, alignSelf: "center", color: "#fff",
        backgroundColor: "rgba(0,0,0,0.6)", padding: 10, borderRadius: 8,
    },
});