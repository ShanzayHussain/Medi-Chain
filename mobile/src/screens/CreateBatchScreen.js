import { useState } from "react";
import {
    View, Text, TextInput, Button, StyleSheet, Alert, ScrollView, Image, Switch,   // CHANGE 1: added Switch
} from "react-native";
import { api } from "../api";
import { C } from "../theme";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function CreateBatchScreen() {
    const [drugName, setDrugName] = useState("");
    const [quantity, setQuantity] = useState("");
    const [mfgDate, setMfgDate] = useState("");
    const [expDate, setExpDate] = useState("");
    const [cold, setCold] = useState(false);                                          // CHANGE 2: new state
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);

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
                cold_chain: cold,                                                     // CHANGE 3a: sent to backend
                min_temp: 2,
                max_temp: 8,
            });
            setResult({ ...data, drug_name: drugName.trim(), quantity: qty, cold });
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

    if (result) {
        return (
            <ScrollView contentContainerStyle={s.container}>
                <Text style={s.title}>Batch created</Text>
                <Text style={s.drug}>{result.drug_name}</Text>
                <Text style={s.meta}>Quantity: {result.quantity}</Text>
                <Text style={s.meta}>Status: {result.status}</Text>
                {result.cold && <Text style={s.meta}>Cold chain: required (2–8 °C)</Text>}
                <Image
                    style={s.qr}
                    source={{ uri: `data:image/png;base64,${result.qr_code_base64}` }}
                />
                <Text style={s.uidLabel}>Batch ID</Text>
                <Text selectable style={s.uid}>{result.batch_uid}</Text>
                <Button title="Create another batch" onPress={reset} />
            </ScrollView>
        );
    }

    return (
        <ScrollView contentContainerStyle={s.container}>
            <Text style={s.title}>New batch</Text>
            <TextInput style={s.input} placeholder="Drug name (e.g. Panadol 500mg)"
                value={drugName} onChangeText={setDrugName} />
            <TextInput style={s.input} placeholder="Quantity (units in this batch)"
                keyboardType="numeric" value={quantity} onChangeText={setQuantity} />
            <TextInput style={s.input} placeholder="Manufacture date (YYYY-MM-DD)"
                value={mfgDate} onChangeText={setMfgDate} />
            <TextInput style={s.input} placeholder="Expiry date (YYYY-MM-DD)"
                value={expDate} onChangeText={setExpDate} />

            {/* CHANGE 3b: cold chain switch */}
            <View style={s.switchRow}>
                <Switch value={cold} onValueChange={setCold} />
                <Text style={s.switchLabel}>Needs cold chain (2–8 °C)</Text>
            </View>

            <Button title={loading ? "Creating..." : "Create batch"} onPress={submit} disabled={loading} />
        </ScrollView>
    );
}

const s = StyleSheet.create({
    container: { padding: 24, paddingBottom: 60 },
    title: { fontSize: 26, fontWeight: "bold", marginBottom: 16 },
    input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, marginBottom: 12 },
    drug: { fontSize: 20, fontWeight: "600", marginBottom: 4 },
    meta: { fontSize: 16, marginBottom: 2 },
    qr: { width: 260, height: 260, alignSelf: "center", marginVertical: 20 },
    uidLabel: { fontWeight: "600" },
    uid: { fontSize: 13, marginBottom: 20 },
    switchRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
    switchLabel: { marginLeft: 10, fontSize: 16 },
});