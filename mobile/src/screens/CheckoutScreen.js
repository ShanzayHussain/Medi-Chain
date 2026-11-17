import { useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, Platform,
} from "react-native";
import { api } from "../api";
import { C } from "../theme";

const luhn = (n) => {
  let sum = 0, alt = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let d = +n[i];
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d; alt = !alt;
  }
  return n.length >= 13 && sum % 10 === 0;
};

export default function CheckoutScreen({ route, navigation }) {
  const { batch_uid, seller_id, seller_stock, seller } = route.params;
  const [info, setInfo] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [qty, setQty] = useState("1");
  const [order, setOrder] = useState(null);
  const [method, setMethod] = useState("card");
  const [card, setCard] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [phone, setPhone] = useState("");
  const [hash, setHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    Promise.all([api(`/custody/verify/${batch_uid}`), api("/payments/config")])
      .then(([v, c]) => { setInfo(v); setCfg(c); })
      .catch((e) => setMsg({ text: e.message, bad: true }));
  }, [batch_uid]);

  // Alert.alert does nothing in the browser, so messages are shown inline
  const run = async (fn) => {
    setBusy(true);
    try { await fn(); } catch (e) { setMsg({ text: e.message, bad: true }); } finally { setBusy(false); }
  };

  const placeOrder = () => {
    const n = parseInt(qty, 10);
    if (!n || n <= 0) return setMsg({ text: "Enter how many units you want", bad: true });
    const available = seller_stock ?? info.quantity_remaining;
    if (n > available) return setMsg({ text: `Only ${available} units left at this pharmacy`, bad: true });
    run(async () => {
      setOrder(await api("/payments/orders", "POST", { batch_uid, quantity: n, ...(seller_id ? { seller_id } : {}) }));
      setMsg(null);
    });
  };

  const paySandbox = () => {
    let reference;
    if (method === "card") {
      const digits = card.replace(/\D/g, "");
      if (!luhn(digits)) return setMsg({ text: "Enter a valid card number. Sandbox test card: 4242 4242 4242 4242", bad: true });
      if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry)) return setMsg({ text: "Expiry must look like 08/28", bad: true });
      if (!/^\d{3,4}$/.test(cvc)) return setMsg({ text: "Enter the 3 or 4 digit CVC", bad: true });
      reference = digits.slice(-4);
    } else {
      if (!/^03\d{9}$/.test(phone)) return setMsg({ text: "Enter a mobile number like 03001234567", bad: true });
      reference = phone;
    }
    run(async () => {
      setReceipt(await api(`/payments/orders/${order.order_id}/pay-sandbox`, "POST", { method, reference }));
    });
  };

  const poll = async (h, tries) => {
    for (let i = 0; i < tries; i++) {
      const res = await api(`/payments/orders/${order.order_id}/verify-crypto`, "POST", { tx_hash: h.trim() });
      if (res.paid) { setReceipt(res); return; }
      setMsg({ text: res.message, bad: false });
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 5000));
    }
  };

  const payWithMetaMask = () => run(async () => {
    const eth = window.ethereum;
    const [from] = await eth.request({ method: "eth_requestAccounts" });
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xaa36a7" }] });
    } catch (e) {
      throw new Error("Please switch MetaMask to the Sepolia network");
    }
    const txHash = await eth.request({
      method: "eth_sendTransaction",
      params: [{ from, to: order.crypto.wallet, value: "0x" + BigInt(order.crypto.amount_wei).toString(16) }],
    });
    setHash(txHash);
    setMsg({ text: "Payment sent. Waiting for confirmation (up to a minute)...", bad: false });
    await poll(txHash, 12);
  });

  const copy = (t) => {
    if (Platform.OS === "web" && navigator.clipboard) {
      navigator.clipboard.writeText(t);
      setMsg({ text: "Copied", bad: false });
    } else {
      setMsg({ text: "Press and hold the address to copy it", bad: false });
    }
  };

  if (!info || !cfg) {
    return msg
      ? <View style={s.pad}><Text style={s.bad}>{msg.text}</Text></View>
      : <ActivityIndicator style={{ marginTop: 60 }} size="large" color={C.primary} />;
  }

  if (receipt) {
    return (
      <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={s.pad}>
        <View style={s.success}>
          <Text style={s.successTitle}>Payment successful</Text>
          <Text style={s.successSub}>PKR {receipt.total_pkr} paid by {receipt.method}</Text>
        </View>
        <Text style={s.text}>Order #{receipt.order_id}</Text>
        <Text selectable style={s.small}>Reference: {receipt.payment_ref}</Text>
        <Text style={s.text}>Units left in this batch: {receipt.units_remaining}</Text>
        {receipt.method === "crypto" && (
          <Text style={s.small}>Verified on the Sepolia test network. Test coins have no real value.</Text>
        )}
        <TouchableOpacity style={s.btn} onPress={() => navigation.navigate("Home", { role: "customer" })}>
          <Text style={s.btnText}>Done</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btn, s.btnAlt]}
          onPress={() => navigation.navigate("Dashboard", { path: "/payments/orders" })}>
          <Text style={s.btnText}>View my orders</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  const methods = [
    ...(cfg.sandbox ? [{ id: "card", label: "Card" }, { id: "jazzcash", label: "JazzCash" }, { id: "easypaisa", label: "Easypaisa" }] : []),
    ...(cfg.crypto.enabled ? [{ id: "crypto", label: "Crypto (Sepolia)" }] : []),
  ];
  const hasMetaMask = Platform.OS === "web" && typeof window !== "undefined" && !!window.ethereum;
  const total = (parseInt(qty, 10) || 0) * info.price_pkr;

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>{info.drug_name}</Text>
      <Text style={s.text}>PKR {info.price_pkr} per unit • {seller_stock ?? info.quantity_remaining} units left{seller ? ` at ${seller}` : ""}</Text>

      {!order ? (
        <View style={s.card}>
          <Text style={s.label}>How many units?</Text>
          <TextInput style={s.input} keyboardType="numeric" value={qty} onChangeText={setQty} />
          <Text style={s.total}>Total: PKR {total}</Text>
          <TouchableOpacity style={s.btn} onPress={placeOrder} disabled={busy}>
            {busy ? <ActivityIndicator color={C.bg} /> : <Text style={s.btnText}>Continue to payment</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        <View>
          <View style={s.card}>
            <Text style={s.text}>Order #{order.order_id} • {order.quantity} units</Text>
            <Text style={s.text}>Sold by {order.seller}</Text>
            <Text style={s.total}>Total: PKR {order.total_pkr}</Text>
          </View>

          <Text style={s.label}>Pay with</Text>
          <View style={s.chips}>
            {methods.map((m) => (
              <TouchableOpacity key={m.id} onPress={() => { setMethod(m.id); setMsg(null); }}
                style={[s.chip, method === m.id && s.chipActive]}>
                <Text style={[s.chipText, method === m.id && s.chipTextActive]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {method !== "crypto" && (
            <View style={s.card}>
              <Text style={s.sandbox}>SANDBOX: no real money moves</Text>
              {method === "card" ? (
                <View>
                  <TextInput style={s.input} placeholder="Card number (test: 4242 4242 4242 4242)"
                    keyboardType="numeric" value={card} onChangeText={setCard} />
                  <View style={{ flexDirection: "row" }}>
                    <TextInput style={[s.input, { flex: 1, marginRight: 8 }]} placeholder="MM/YY"
                      value={expiry} onChangeText={setExpiry} />
                    <TextInput style={[s.input, { flex: 1 }]} placeholder="CVC" keyboardType="numeric"
                      secureTextEntry value={cvc} onChangeText={setCvc} />
                  </View>
                  <Text style={s.small}>A card ending in 0002 simulates a declined payment.</Text>
                </View>
              ) : (
                <TextInput style={s.input} placeholder={`${method === "jazzcash" ? "JazzCash" : "Easypaisa"} mobile number (03001234567)`}
                  keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
              )}
              <TouchableOpacity style={s.btn} onPress={paySandbox} disabled={busy}>
                {busy ? <ActivityIndicator color={C.bg} /> : <Text style={s.btnText}>Pay PKR {order.total_pkr}</Text>}
              </TouchableOpacity>
            </View>
          )}

          {method === "crypto" && (
            <View style={s.card}>
              <Text style={s.sandbox}>SEPOLIA TEST NETWORK: test coins, no real value</Text>
              <Text style={s.text}>Send exactly</Text>
              <Text selectable style={s.eth}>{order.crypto.amount_eth} ETH</Text>
              <Text style={s.small}>Demo rate: 1 ETH = {cfg.crypto.pkr_per_eth.toLocaleString()} PKR</Text>
              <Text style={[s.text, { marginTop: 8 }]}>to the pharmacy wallet:</Text>
              <Text selectable style={s.addr}>{order.crypto.wallet}</Text>
              <TouchableOpacity onPress={() => copy(order.crypto.wallet)}>
                <Text style={s.link}>Copy address</Text>
              </TouchableOpacity>

              {hasMetaMask && (
                <TouchableOpacity style={s.btn} onPress={payWithMetaMask} disabled={busy}>
                  {busy ? <ActivityIndicator color={C.bg} /> : <Text style={s.btnText}>Pay with MetaMask</Text>}
                </TouchableOpacity>
              )}

              <Text style={[s.label, { marginTop: 14 }]}>Or paste the transaction hash</Text>
              <TextInput style={s.input} placeholder="0x..." autoCapitalize="none" value={hash} onChangeText={setHash} />
              <TouchableOpacity style={[s.btn, s.btnAlt]} onPress={() => run(() => poll(hash, 1))} disabled={busy}>
                <Text style={s.btnText}>Verify payment</Text>
              </TouchableOpacity>
              <Text style={s.small}>
                Send it from your Customer account on the Sepolia network, then copy the hash from MetaMask's Activity tab.
              </Text>
            </View>
          )}
        </View>
      )}

      {msg && <Text style={msg.bad ? s.bad : s.info}>{msg.text}</Text>}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  pad: { padding: 20, paddingBottom: 60 },
  title: { fontSize: 24, fontWeight: "bold", color: C.navy, marginBottom: 4 },
  text: { color: C.dark, fontSize: 15, marginBottom: 2 },
  small: { color: C.muted, fontSize: 12, marginTop: 6 },
  label: { fontWeight: "600", color: C.navy, marginBottom: 6, marginTop: 10 },
  card: { backgroundColor: C.card, borderRadius: 12, padding: 14, marginTop: 12, borderLeftWidth: 4, borderLeftColor: C.accent },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 12, marginBottom: 10, backgroundColor: C.card, color: C.dark },
  total: { fontSize: 20, fontWeight: "bold", color: C.navy, marginVertical: 8 },
  btn: { backgroundColor: C.primary, borderRadius: 10, padding: 14, alignItems: "center", marginTop: 8 },
  btnAlt: { backgroundColor: C.accent },
  btnText: { color: C.bg, fontSize: 16, fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap" },
  chip: { borderWidth: 1, borderColor: C.border, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, marginBottom: 8, backgroundColor: C.card },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { color: C.navy, fontWeight: "600" },
  chipTextActive: { color: C.bg },
  sandbox: { color: C.warn, fontWeight: "700", fontSize: 12, marginBottom: 8 },
  eth: { fontSize: 22, fontWeight: "bold", color: C.navy },
  addr: { fontSize: 12, color: C.dark, marginTop: 2 },
  link: { color: C.accent, fontWeight: "700", marginTop: 6 },
  bad: { color: C.danger, marginTop: 12, fontSize: 15 },
  info: { color: C.primary, marginTop: 12, fontSize: 15 },
  success: { backgroundColor: C.ok, borderRadius: 12, padding: 18, marginBottom: 14 },
  successTitle: { color: "#fff", fontSize: 22, fontWeight: "bold" },
  successSub: { color: "#fff", marginTop: 4 },
});
