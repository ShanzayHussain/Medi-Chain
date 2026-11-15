import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ImageBackground, Image, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { C, GRAD, SHADOW } from "../theme";

const CHAIN = [
  { icon: "factory", label: "Manufacturer" },
  { icon: "truck-delivery-outline", label: "Distributor" },
  { icon: "storefront-outline", label: "Pharmacy" },
  { icon: "account-outline", label: "Customer" },
];

export default function CustomerHome({ navigation, go }) {
  const [showId, setShowId] = useState(false);
  const [id, setId] = useState("");
  const openId = () => { const v = id.trim(); if (v) navigation.navigate("VerifyResult", { batch_uid: v }); };
  const tiles = [
    { icon: "qrcode-scan", label: "Scan QR Code", onPress: () => navigation.navigate("Scan", { mode: "verify" }) },
    { icon: "keyboard-outline", label: "Enter Batch ID", onPress: () => setShowId(!showId) },
    { icon: "storefront-outline", label: "Shop Medicines", onPress: () => go("shop") },
    { icon: "clipboard-text-outline", label: "My Orders", onPress: () => go("orders") },
  ];
  return (
    <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <View style={s.head}><LinearGradient colors={GRAD} style={s.logo}><Icon name="shield-check" size={26} color="#fff" /></LinearGradient><View style={{ marginLeft: 10 }}><Text style={s.brand}>MediChain</Text><Text style={s.tag}>Trusted Medicine. Transparent Supply.</Text></View></View>
      <ImageBackground source={require("../../assets/shield-pills.png")} style={s.banner} imageStyle={{ borderRadius: 18 }}>
        <LinearGradient colors={["rgba(27,67,50,0.96)", "rgba(27,67,50,0.78)", "rgba(27,67,50,0.05)"]} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[StyleSheet.absoluteFill, { borderRadius: 18 }]} />
        <View style={{ width: "64%" }}><Text style={s.kicker}>Verify • Shop • Track</Text><Text style={s.bannerTitle}>Fight Counterfeit Medicines</Text><Text style={s.bannerSub}>Every batch has a tamper-evident supply history.</Text></View>
      </ImageBackground>
      <View style={s.grid}>{tiles.map((t) => <TouchableOpacity key={t.label} style={s.tile} onPress={t.onPress} activeOpacity={0.85}><View style={s.tileIcon}><Icon name={t.icon} size={30} color={C.primary} /></View><Text style={s.tileText}>{t.label}</Text></TouchableOpacity>)}</View>
      {showId && <View style={s.idRow}><TextInput style={s.idInput} placeholder="Paste a batch ID" placeholderTextColor={C.muted} autoCapitalize="none" value={id} onChangeText={setId} onSubmitEditing={openId} /><TouchableOpacity style={s.idBtn} onPress={openId}><Icon name="arrow-right" size={22} color="#fff" /></TouchableOpacity></View>}
      <Text style={s.section}>Supply chain status</Text>
      <View style={s.card}><View style={s.chain}>{CHAIN.map((c, i) => <View key={c.label} style={s.chainItem}><View style={s.chainIcon}><Icon name={c.icon} size={22} color={C.primary} /></View><Text style={s.chainLabel}>{c.label}</Text>{i < CHAIN.length - 1 && <Icon name="chevron-right" size={18} color={C.accent} style={s.arrow} />}</View>)}</View><Text style={s.cardNote}>Every hand-over is recorded and re-checked each time you scan.</Text></View>
      <View style={[s.card, s.how]}><Image source={require("../../assets/jar-qr.png")} style={s.howImg} /><View style={{ flex: 1, marginLeft: 12 }}><Text style={s.howTitle}>How verification works</Text><Text style={s.howText}>1. Scan the QR on the pack{"\n"}2. We recheck the whole history{"\n"}3. You see expiry, stock and any warnings</Text></View></View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  pad: { padding: 18, paddingBottom: 30 }, head: { flexDirection: "row", alignItems: "center", marginBottom: 14 }, logo: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" }, brand: { fontSize: 22, fontWeight: "bold", color: C.navy }, tag: { color: C.muted, fontSize: 12 }, banner: { borderRadius: 18, padding: 18, minHeight: 170, justifyContent: "center", overflow: "hidden" }, kicker: { color: C.soft, fontWeight: "600", fontSize: 12 }, bannerTitle: { color: "#fff", fontSize: 24, fontWeight: "bold", marginTop: 4 }, bannerSub: { color: C.onDark, marginTop: 6, fontSize: 13 }, grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 16 }, tile: { width: "48%", backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 12, alignItems: "center", ...SHADOW }, tileIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: C.tint, alignItems: "center", justifyContent: "center" }, tileText: { marginTop: 8, fontWeight: "600", color: C.navy, textAlign: "center" }, idRow: { flexDirection: "row", marginBottom: 6 }, idInput: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, backgroundColor: C.card, color: C.dark }, idBtn: { width: 48, marginLeft: 8, borderRadius: 12, backgroundColor: C.primary, alignItems: "center", justifyContent: "center" }, section: { fontSize: 17, fontWeight: "bold", color: C.navy, marginTop: 14, marginBottom: 8 }, card: { backgroundColor: C.card, borderRadius: 16, padding: 14, ...SHADOW }, chain: { flexDirection: "row", justifyContent: "space-between" }, chainItem: { alignItems: "center", flex: 1 }, chainIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.tint, alignItems: "center", justifyContent: "center" }, chainLabel: { fontSize: 10, color: C.muted, marginTop: 4 }, arrow: { position: "absolute", right: -9, top: 13 }, cardNote: { color: C.muted, fontSize: 12, marginTop: 10, textAlign: "center" }, how: { flexDirection: "row", alignItems: "center", marginTop: 14 }, howImg: { width: 84, height: 84, borderRadius: 14 }, howTitle: { fontWeight: "bold", color: C.navy, marginBottom: 4 }, howText: { color: C.dark, fontSize: 13, lineHeight: 19 },
});
