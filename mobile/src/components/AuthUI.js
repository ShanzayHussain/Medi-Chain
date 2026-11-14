import { useState } from "react";
import {
    View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet,
} from "react-native";
import { C } from "../theme";

export function Field({ label, secure, ...props }) {
    const [hidden, setHidden] = useState(!!secure);
    return (
        <View style={s.fieldWrap}>
            <Text style={s.label}>{label}</Text>
            <View style={s.inputRow}>
                <TextInput
                    style={s.input}
                    placeholderTextColor="#9aa5b5"
                    secureTextEntry={hidden}
                    {...props}
                />
                {secure && (
                    <TouchableOpacity onPress={() => setHidden(!hidden)}>
                        <Text style={s.toggle}>{hidden ? "Show" : "Hide"}</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

export function PrimaryButton({ title, onPress, loading }) {
    return (
        <TouchableOpacity style={[s.btn, loading && { opacity: 0.7 }]} onPress={onPress} disabled={loading}>
            {loading ? <ActivityIndicator color={C.bg} /> : <Text style={s.btnText}>{title}</Text>}
        </TouchableOpacity>
    );
}

export function LinkButton({ text, link, onPress }) {
    return (
        <TouchableOpacity onPress={onPress} style={s.linkWrap}>
            <Text style={s.linkText}>
                {text} <Text style={s.linkBold}>{link}</Text>
            </Text>
        </TouchableOpacity>
    );
}

const s = StyleSheet.create({
    fieldWrap: { marginBottom: 14 },
    label: { color: C.navy, fontWeight: "600", marginBottom: 6 },
    inputRow: {
        flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: C.border,
        borderRadius: 10, backgroundColor: "#f8fafc", paddingHorizontal: 12,
    },
    input: { flex: 1, paddingVertical: 12, color: C.dark, fontSize: 16 },
    toggle: { color: C.accent, fontWeight: "600", paddingLeft: 10 },
    btn: { backgroundColor: C.primary, borderRadius: 10, padding: 15, alignItems: "center", marginTop: 6 },
    btnText: { color: C.bg, fontSize: 17, fontWeight: "600" },
    linkWrap: { marginTop: 18, alignItems: "center" },
    linkText: { color: C.muted, fontSize: 15 },
    linkBold: { color: C.accent, fontWeight: "700" },
});