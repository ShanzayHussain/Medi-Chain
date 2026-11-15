import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { api, setToken } from "../api";
import { C, GRAD, SHADOW } from "../theme";
import { Field, PrimaryButton, LinkButton } from "../components/AuthUI";

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const login = async () => {
    if (!email.trim() || !password) return setErr("Enter your email and password");
    setErr("");
    setLoading(true);
    try {
      const data = await api("/auth/login", "POST", { email: email.trim(), password });
      setToken(data.access_token);
      navigation.replace("Home", { role: data.role, user: data.user });
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={s.hero}>
          <Image source={require("../../assets/hero.png")} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <LinearGradient colors={["rgba(244,251,246,0)", C.bg]} style={s.fade} />
          <LinearGradient colors={GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.brand}>
            <Icon name="shield-check" size={22} color="#fff" />
            <Text style={s.brandText}>MediChain</Text>
          </LinearGradient>
          <Text style={s.tagline}>Trusted Medicine. Transparent Supply.</Text>
        </View>
        <View style={s.card}>
          <Text style={s.heading}>Welcome back</Text>
          <Field label="Email" placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
          <Field label="Password" placeholder="Your password" secure value={password} onChangeText={setPassword} />
          {!!err && <Text style={s.err}>{err}</Text>}
          <PrimaryButton title="Log in" onPress={login} loading={loading} />
          <LinkButton text="New here?" link="Create an account" onPress={() => navigation.navigate("Register")} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  hero: { height: 300, overflow: "hidden" },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 130 },
  brand: { position: "absolute", top: 44, left: 18, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  brandText: { color: "#fff", fontSize: 18, fontWeight: "bold", marginLeft: 8 },
  tagline: { position: "absolute", bottom: 50, alignSelf: "center", color: C.navy, fontWeight: "700", fontSize: 15 },
  card: { marginTop: -30, marginHorizontal: 20, marginBottom: 30, backgroundColor: C.card, borderRadius: 20, padding: 22, ...SHADOW },
  heading: { fontSize: 22, fontWeight: "bold", color: C.navy, marginBottom: 16 },
  err: { color: C.danger, marginBottom: 8 },
});
