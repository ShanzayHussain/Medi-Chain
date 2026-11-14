import { useEffect, useRef } from "react";
import {
    View, Text, TouchableOpacity, Animated, StyleSheet, Pressable, ScrollView, Dimensions,
} from "react-native";
import { C } from "../theme";

const W = Math.min(300, Dimensions.get("window").width * 0.8);

export default function SideMenu({ open, onClose, role, items, onSelect, onLogout }) {
    const x = useRef(new Animated.Value(-W)).current;
    const fade = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(x, { toValue: open ? 0 : -W, duration: 220, useNativeDriver: true }),
            Animated.timing(fade, { toValue: open ? 1 : 0, duration: 220, useNativeDriver: true }),
        ]).start();
    }, [open]);

    return (
        <View pointerEvents={open ? "auto" : "none"} style={StyleSheet.absoluteFill}>
            <Animated.View style={[s.backdrop, { opacity: fade }]}>
                <Pressable style={{ flex: 1 }} onPress={onClose} />
            </Animated.View>

            <Animated.View style={[s.panel, { width: W, transform: [{ translateX: x }] }]}>
                <View style={s.head}>
                    <Text style={s.brand}>MediChain</Text>
                    <Text style={s.role}>{role}</Text>
                </View>

                <ScrollView style={{ flex: 1 }}>
                    {items.map((it) => (
                        <TouchableOpacity key={it.label} style={s.item} onPress={() => onSelect(it)}>
                            <Text style={s.itemText}>{it.label}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                <TouchableOpacity style={s.logout} onPress={onLogout}>
                    <Text style={s.logoutText}>Log out</Text>
                </TouchableOpacity>
            </Animated.View>
        </View>
    );
}

const s = StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10,17,40,0.55)" },
    panel: { position: "absolute", top: 0, bottom: 0, left: 0, backgroundColor: C.navy, elevation: 12 },
    head: { padding: 20, paddingTop: 28, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.15)" },
    brand: { color: C.bg, fontSize: 22, fontWeight: "bold" },
    role: { color: "#9fd3e6", marginTop: 4, textTransform: "capitalize" },
    item: { paddingVertical: 16, paddingHorizontal: 20 },
    itemText: { color: C.bg, fontSize: 17 },
    logout: { padding: 18, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.15)", backgroundColor: C.dark },
    logoutText: { color: "#ff8a80", fontSize: 17, fontWeight: "600" },
});