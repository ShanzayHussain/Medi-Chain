import { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { api } from "../api";
import Btn from "../components/Btn";
import { C, SHADOW } from "../theme";

export default function UnitTransferScreen({ route }) {
  const { mode } = route.params;
  const [permission, requestPermission] = useCameraPermissions();
  const [recipients, setRecipients] = useState([]);
  const [recipientId, setRecipientId] = useState(null);
  const [unitUids, setUnitUids] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [location, setLocation] = useState("");
  const [locked, setLocked] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      if (mode === "send") {
        const result = await api("/unit-transfers/recipients");
        setRecipients(result.items || []);
      } else {
        const result = await api("/unit-transfers/pending");
        setPending(result.items || []);
      }
    } catch (e) {
      Alert.alert("Could not load transfers", e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [mode]);

  const onScan = ({ data }) => {
    if (locked || !data) return;
    setLocked(true);
    if (!data.startsWith("MCU:")) {
      Alert.alert("Unit QR required", "Scan an individual medicine QR label.");
    } else {
      const uid = data.slice(4);
      setUnitUids((previous) => {
        if (previous.includes(uid)) {
          Alert.alert("Already scanned", "That medicine unit is already in this transfer.");
          return previous;
        }
        return [...previous, uid];
      });
    }
    setTimeout(() => setLocked(false), 700);
  };

  const submitTransfer = async () => {
    if (!unitUids.length) return Alert.alert("No units selected", "Scan at least one unit QR.");
    if (!recipientId) return Alert.alert("Choose a recipient", "Select the next organization in the supply chain.");
    if (!location.trim()) return Alert.alert("Missing location", "Enter the hand-off location.");
    setBusy(true);
    try {
      const result = await api("/unit-transfers", "POST", {
        unit_uids: unitUids,
        recipient_id: recipientId,
        location: location.trim(),
      });
      Alert.alert("Transfer sent", `${result.unit_count} unit(s) are pending recipient confirmation.`);
      setUnitUids([]);
      setRecipientId(null);
      setLocation("");
    } catch (e) {
      Alert.alert("Could not send transfer", e.message);
    } finally {
      setBusy(false);
    }
  };

  const receive = async (operationUid) => {
    setBusy(true);
    try {
      const result = await api(`/unit-transfers/${operationUid}/receive`, "POST");
      Alert.alert("Receipt confirmed", `${result.unit_count} unit(s) are now in your inventory.`);
      await load();
    } catch (e) {
      Alert.alert("Could not confirm receipt", e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 60 }} size="large" color={C.primary} />;

  if (mode === "receive") {
    return (
      <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={s.pad}>
        <Text style={s.title}>Pending unit receipts</Text>
        <Btn title="Refresh" variant="outline" onPress={load} />
        {!pending.length && <Text style={s.muted}>No pending serialized transfers.</Text>}
        {pending.map((item) => (
          <View key={item.operation_uid} style={s.card}>
            <Text style={s.cardTitle}>{item.unit_count} medicine unit(s)</Text>
            <Text style={s.muted}>Handoff location: {item.location}</Text>
            <Text style={s.muted}>Sent: {item.created_at?.slice(0, 16).replace("T", " ")}</Text>
            <Btn title={busy ? "Confirming..." : "Confirm receipt"}
              onPress={() => receive(item.operation_uid)} disabled={busy} />
          </View>
        ))}
      </ScrollView>
    );
  }

  if (!permission?.granted) {
    return (
      <View style={s.permission}>
        <Icon name="qrcode-scan" size={54} color={C.primary} />
        <Text style={s.muted}>Camera access is needed to scan individual medicine labels.</Text>
        <Btn title="Allow camera" onPress={requestPermission} />
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>Transfer serialized units</Text>
      <View style={s.camera}><CameraView style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={onScan} />
        <View pointerEvents="none" style={s.cameraHint}><Text style={s.hintText}>Scan unique unit QRs</Text></View>
      </View>
      <View style={s.card}>
        <Text style={s.cardTitle}>{unitUids.length} unit(s) selected</Text>
        <Text style={s.muted}>The recipient becomes owner after confirming receipt.</Text>
        <TextInput style={s.input} placeholder="Handoff location" value={location} onChangeText={setLocation} />
        <Text style={s.label}>Next recipient</Text>
        {!recipients.length && <Text style={s.muted}>No eligible recipient accounts were found.</Text>}
        {recipients.map((recipient) => (
          <TouchableOpacity key={recipient.id} style={[s.recipient, recipientId === recipient.id && s.selected]}
            onPress={() => setRecipientId(recipient.id)}>
            <Text style={s.recipientName}>{recipient.organization}</Text>
            <Text style={s.muted}>{recipient.role}</Text>
          </TouchableOpacity>
        ))}
        <Btn title={busy ? "Sending..." : `Send ${unitUids.length} unit(s)`}
          onPress={submitTransfer} disabled={busy || !recipients.length} />
      </View>
      {!!unitUids.length && <Btn title="Clear selected units" variant="outline" onPress={() => setUnitUids([])} />}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  pad: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: "bold", color: C.navy, marginBottom: 14 },
  muted: { color: C.muted, marginVertical: 4 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginVertical: 8, ...SHADOW },
  cardTitle: { fontSize: 17, fontWeight: "700", color: C.navy, marginBottom: 6 },
  camera: { height: 240, overflow: "hidden", borderRadius: 16, backgroundColor: "#111" },
  cameraHint: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "flex-end", paddingBottom: 12 },
  hintText: { color: "#fff", backgroundColor: "rgba(0,0,0,0.65)", padding: 8, borderRadius: 8 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, marginVertical: 10, color: C.dark },
  label: { color: C.navy, fontWeight: "700", marginTop: 6 },
  recipient: { padding: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border, marginTop: 8 },
  selected: { borderColor: C.primary, backgroundColor: C.tint },
  recipientName: { color: C.dark, fontWeight: "600" },
  permission: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
});
