import { useState } from "react";
import {
    View, Text, TextInput, Button, StyleSheet, Alert, ScrollView, Image, Switch, Platform,
} from "react-native";
import { api } from "../api";
import { C } from "../theme";
import { printLabels, saveLabelsPdf, downloadPng } from "../qrLabels";

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
    const [unitLabelsBusy, setUnitLabelsBusy] = useState(false);
    const [unitLabelsProgress, setUnitLabelsProgress] = useState("");
    const [unitLabelsError, setUnitLabelsError] = useState("");

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
        setCold(false);
    };

    const run = async (fn) => {
        try { await fn(); } catch (e) { Alert.alert("Could not complete", e.message); }
    };

    const downloadAllUnitLabels = async (print = false) => {
        // Open synchronously from the tap so browsers do not block the print window
        // after the asynchronous paginated QR requests finish.
        const printWindow = Platform.OS === "web" ? window.open("", "_blank") : null;
        setUnitLabelsBusy(true);
        setUnitLabelsError("");
        setUnitLabelsProgress("Loading medicine QR codes...");
        try {
            if (Platform.OS === "web" && !printWindow) {
                throw new Error("Allow pop-ups to print or save the QR labels as PDF.");
            }
            const pageSize = 100;
            const items = [];
            let total = null;
            for (let offset = 0; total === null || offset < total; offset += pageSize) {
                const data = await api(`/batches/${result.batch_uid}/unit-labels?limit=${pageSize}&offset=${offset}`);
                if (total === null) total = data.total;
                if (data.total !== total || !Array.isArray(data.items) || data.items.length === 0 && offset < total) {
                    throw new Error("Could not load every medicine QR label. Please try again.");
                }
                items.push(...data.items);
                setUnitLabelsProgress(`Loaded ${items.length} of ${total} medicine QR codes...`);
            }
            if (items.length !== total || total !== result.quantity) {
                throw new Error(`Expected ${result.quantity} medicine QR codes, but found ${items.length}.`);
            }
            const opts = { drug: result.drug_name, expiry: result.expiry, units: items };
            if (Platform.OS === "web") {
                await printLabels(opts, printWindow);
            } else if (!print) {
                const outcome = await saveLabelsPdf(
                    opts,
                    `medichain-units-${result.batch_uid.slice(0, 8)}`,
                );
                if (!outcome?.saved) Alert.alert("Download cancelled", "Choose a folder to save the PDF.");
                else if (outcome.shared) Alert.alert("PDF ready", "Use the share menu to save the medicine QR PDF.");
                else if (Platform.OS === "android") Alert.alert("PDF downloaded", "The medicine QR PDF was saved to your selected folder.");
            } else {
                await printLabels(opts);
            }
        } catch (e) {
            if (printWindow && !printWindow.closed) printWindow.close();
            setUnitLabelsError(e.message || "Could not prepare medicine labels.");
            Alert.alert("Could not prepare medicine QR PDF", e.message);
        } finally {
            setUnitLabelsBusy(false);
            setUnitLabelsProgress("");
        }
    };

    if (result) {
        return (
            <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={s.container}>
                <Text style={s.title}>Batch created</Text>
                <Text style={s.drug}>{result.drug_name}</Text>
                <Text style={s.meta}>Quantity: {result.quantity}</Text>
                <Text style={s.meta}>Serialized units created: {result.unit_count}</Text>
                <Text style={s.meta}>Expiry: {result.expiry}</Text>
                {result.cold && <Text style={s.meta}>Cold chain: required (2–8 °C)</Text>}

                <Image style={s.qr} source={{ uri: `data:image/png;base64,${result.qr_code_base64}` }} />
                <Text style={s.uidLabel}>Batch ID</Text>
                <Text selectable style={s.uid}>{result.batch_uid}</Text>

                <Text style={s.label}>Individual medicine QR labels</Text>
                <Text style={s.note}>PDFs include one unique QR label for every package in this batch ({result.quantity} labels).</Text>
                {!!unitLabelsProgress && <Text style={s.note}>{unitLabelsProgress}</Text>}
                {!!unitLabelsError && <Text style={s.error}>{unitLabelsError}</Text>}
                <View style={s.btn}><Button title={unitLabelsBusy ? "Preparing medicine labels..." : "Save / share as PDF"} color={C.accent}
                    onPress={() => downloadAllUnitLabels()} disabled={unitLabelsBusy} /></View>
                <View style={s.btn}><Button title={unitLabelsBusy ? "Preparing medicine labels..." : "Print labels"} color={C.primary}
                    onPress={() => downloadAllUnitLabels(true)} disabled={unitLabelsBusy} /></View>
                {Platform.OS === "web" && (
                    <View style={s.btn}><Button title="Download batch QR as PNG" color={C.accent}
                        onPress={() => downloadPng(result.qr_code_base64, `qr-${result.batch_uid.slice(0, 8)}`)} /></View>
                )}
                <View style={s.btn}><Button title="Create another batch" color={C.navy} onPress={reset} /></View>
                <Text style={s.note}>
                    Each medicine label has a unique QR linked to this batch. Use the batch QR above for batch-level verification.
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
    error: { color: C.danger, marginTop: 8, fontSize: 13 },
    switchRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
    switchLabel: { marginLeft: 10, fontSize: 16, color: C.dark },
});
