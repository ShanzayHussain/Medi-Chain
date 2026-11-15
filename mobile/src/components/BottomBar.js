import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { C } from "../theme";

const TABS = [
  { id: "home", label: "Home", icon: "home-outline", on: "home" },
  { id: "verify", label: "Verify", icon: "shield-check-outline", on: "shield-check" },
  { id: "shop", label: "Shop", icon: "storefront-outline", on: "storefront" },
  { id: "orders", label: "Orders", icon: "clipboard-text-outline", on: "clipboard-text" },
  { id: "profile", label: "Profile", icon: "account-outline", on: "account" },
];

export default function BottomBar({ active, onChange, tabs = TABS }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {tabs.map((t) => {
        const on = active === t.id;
        return (
          <TouchableOpacity key={t.id} style={s.tab} onPress={() => onChange(t.id)}>
            <Icon name={on ? t.on : t.icon} size={24} color={on ? C.primary : C.muted} />
            <Text style={[s.label, on && s.labelOn]}>{t.label}</Text>
            {on && <View style={s.dot} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: "row", backgroundColor: C.card, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: C.border,
  },
  tab: { flex: 1, alignItems: "center" },
  label: { fontSize: 11, color: C.muted, marginTop: 2 },
  labelOn: { color: C.primary, fontWeight: "700" },
  dot: { width: 18, height: 3, borderRadius: 2, backgroundColor: C.primary, marginTop: 3 },
});
