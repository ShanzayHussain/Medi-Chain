import { useState } from "react";
import {
    View, Text, TextInput, Button, StyleSheet, Alert, ScrollView, Image, Switch, Platform,
} from "react-native";
import { api } from "../api";
import { C } from "../theme";
import { printLabels, shareLabels, downloadPng } from "../qrLabels";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function CreateBatchScreen() {
    const [drugName, setDrugName] = useState("");
    const [quantity, setQuantity] = useState("");
    const [mfgDate, setMfgDate] = useState("");
    const [expDate, setExpDate] = useState("");
    const [price, setPrice] = useState("100");
    const [cold, setCold] = useState(false);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [copies, setCopies] = useState("12");

    const submit = async () => {
        const qty = parseInt(quantity, 10);
        if (!drugName.trim()) return Alert.alert("Missing", "Enter the drug name");
        if (!qty || qty <= 0) return Alert.alert("Invalid", "Quantity must be a positive number");
        if (!DATE_RE.test(mfgDate) || !DATE_RE.test(expDate))
            return Alert.alert("Invalid date", "Use the format YYYY-MM-DD, e.g. 2026-09-01");
        if (expDate <= mfgDate)
            return Alert.alert("Invalid date", "Expiry date must be after the manufacture date");

        setLoading(true);
        try {
            const data = await api("/batches/", "POST", {
                drug_name: drugName.trim(),
                quantity: qty,
                manufacture_date: mfgDate,
                expiry_date: expDate,
                price_pkr: parseInt(price, 10) || 0,
                cold_chain: cold,
                min_temp: 2,
                max_temp: 8,
            });
            setResult({ ...data, drug_name: drugName.trim(), quantity: qty, expiry: expDate, cold });
        } catch (e) {
            Alert.alert("Could not create batch", e.message);
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setResult(null);
        setDrugName(""); setQuantity(""); setMfgDate(""); setExpDate("");
        setCold(false); setCopies("12");
    };

    const labelOpts = () => {
        const n = Math.min(60, Math.max(1, parseInt(copies, 10) || 1));
        return {
            qr: result.qr_code_base64, drug: result.drug_name, uid: result.batch_uid,
            expiry: result.expiry, copies: n
        };
    };

    const run = async (fn) => {
        try { await fn(); } catch (e) { Alert.alert("Could not complete", e.message); }
    };

    if (result) {
        return (
            <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={s.container}>
                <Text style={s.title}>Batch created</Text>
                <Text style={s.drug}>{result.drug_name}</Text>
                <Text style={s.meta}>Quantity: {result.quantity}</Text>
                <Text style={s.meta}>Expiry: {result.expiry}</Text>
                {result.cold && <Text style={s.meta}>Cold chain: required (2–8 °C)</Text>}

                <Image style={s.qr} source={{ uri: `data:image/png;base64,${result.qr_code_base64}` }} />
                <Text style={s.uidLabel}>Batch ID</Text>
                <Text selectable style={s.uid}>{result.batch_uid}</Text>

                <Text style={s.label}>Number of labels to print</Text>
                <TextInput style={s.input} keyboardType="numeric" value={copies} onChangeText={setCopies} />

                <View style={s.btn}><Button title="Print labels" color={C.primary}
                    onPress={() => run(() => printLabels(labelOpts()))} /></View>
                <View style={s.btn}><Button title="Save / share as PDF" color={C.accent}
                    onPress={() => run(() => shareLabels(labelOpts()))} /></View>
                {Platform.OS === "web" && (
                    <View style={s.btn}><Button title="Download QR as PNG" color={C.accent}
                        onPress={() => downloadPng(result.qr_code_base64, `qr-${result.batch_uid.slice(0, 8)}`)} /></View>
                )}
                <View style={s.btn}><Button title="Create another batch" color={C.navy} onPress={reset} /></View>
                <Text style={s.note}>
                    Print the QR and stick it on the packs or cartons before dispatch. The QR only contains the batch ID.
                </Text>
            </ScrollView>
        );
    }

    return (
        <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={s.container}>
            <Text style={s.title}>New batch</Text>
            <TextInput style={s.input} placeholder="Drug name (e.g. Panadol 500mg)"
                value={drugName} onChangeText={setDrugName} />
            <TextInput style={s.input} placeholder="Quantity (units in this batch)"
                keyboardType="numeric" value={quantity} onChangeText={setQuantity} />
            <TextInput style={s.input} placeholder="Manufacture date (YYYY-MM-DD)"
                value={mfgDate} onChangeText={setMfgDate} />
            <TextInput style={s.input} placeholder="Expiry date (YYYY-MM-DD)"
                value={expDate} onChangeText={setExpDate} />
            <TextInput style={s.input} placeholder="Price per unit (PKR)" keyboardType="numeric"
                value={price} onChangeText={setPrice} />
            <View style={s.switchRow}>
                <Switch value={cold} onValueChange={setCold} />
                <Text style={s.switchLabel}>Needs cold chain (2–8 °C)</Text>
            </View>
            <Button title={loading ? "Creating..." : "Create batch"} color={C.primary}
                onPress={submit} disabled={loading} />
        </ScrollView>
    );
}

const s = StyleSheet.create({
    container: { padding: 24, paddingBottom: 60 },
    title: { fontSize: 26, fontWeight: "bold", color: C.navy, marginBottom: 16 },
    input: { borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 12, marginBottom: 12, backgroundColor: "#fff" },
    drug: { fontSize: 20, fontWeight: "600", color: C.dark, marginBottom: 4 },
    meta: { fontSize: 16, color: C.dark, marginBottom: 2 },
    qr: { width: 260, height: 260, alignSelf: "center", marginVertical: 20 },
    uidLabel: { fontWeight: "600", color: C.navy },
    uid: { fontSize: 13, marginBottom: 16, color: C.dark },
    label: { fontWeight: "600", color: C.navy, marginBottom: 6 },
    btn: { marginBottom: 10 },
    note: { color: C.muted, marginTop: 8, fontSize: 13 },
    switchRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
    switchLabel: { marginLeft: 10, fontSize: 16, color: C.dark },
});
