import { Text, TouchableOpacity, StyleSheet } from "react-native";
import { C } from "../theme";

export default function Btn({ title, onPress, disabled, variant = "primary", style }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled}
      style={[s.btn, s[variant], disabled && { opacity: 0.6 }, style]}
    >
      <Text style={[s.text, variant === "outline" && { color: C.primary }]}>{title}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 10 },
  primary: { backgroundColor: C.primary },
  alt: { backgroundColor: C.accent },
  danger: { backgroundColor: C.danger },
  outline: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: C.primary },
  text: { color: C.bg, fontSize: 16, fontWeight: "600" },
});