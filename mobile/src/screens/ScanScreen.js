import { useState } from "react";
import { View, Text, TextInput, Button, StyleSheet, Alert } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { api } from "../api";

export default function ScanScreen({ route, navigation }) {
    const { mode } = route.params; // "receive" or "verify"
    const [permission, requestPermission] = useCameraPermissions();
    const [uid, setUid] = useState(null);       // scanned batch id (receive mode)
    const [location, setLocation] = useState("");
    const [busy, setBusy] = useState(false);
    const [locked, setLocked] = useState(false); // stops the camera firing many times

    if (!permission) return <View />;
    if (!permission.granted) {
        return (
            <View style={s.center}>
                <Text style={s.msg}>Camera permission is needed to scan QR codes</Text>
                <Button title="Allow camera" onPress={requestPermission} />
            </View>
        );
    }

    const onScan = ({ data }) => {
        if (locked) return;
        setLocked(true);
        if (mode === "verify") {
            navigation.replace("VerifyResult", { batch_uid: data });
        } else {
            setUid(data);
        }
    };

    const confirmReceive = async () => {
        if (!location.trim()) return Alert.alert("Missing", "Enter your location");
        setBusy(true);
        try {
            const res = await api("/custody/transfer", "POST", {
                batch_uid: uid,
                location: location.trim(),
            });
            Alert.alert("Recorded", res.message, [{ text: "OK", onPress: () => navigation.goBack() }]);
        } catch (e) {
            Alert.alert("Could not record", e.message);
            setUid(null);
            setLocked(false);
        } finally {
            setBusy(false);
        }
    };

    if (mode === "receive" && uid) {
        return (
            <View style={s.form}>
                <Text style={s.title}>Batch scanned</Text>
                <Text selectable style={s.uid}>{uid}</Text>
                <TextInput style={s.input} placeholder="Your location (e.g. Karachi Hub)"
                    value={location} onChangeText={setLocation} />
                <Button title={busy ? "Saving..." : "Confirm received"} onPress={confirmReceive} disabled={busy} />
                <View style={{ height: 10 }} />
                <Button title="Scan again" onPress={() => { setUid(null); setLocked(false); }} />
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
        backgroundColor: "rgba(0,0,0,0.6)", padding: 10, borderRadius: 8
    },
});