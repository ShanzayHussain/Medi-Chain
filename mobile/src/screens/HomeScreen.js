import { useLayoutEffect, useState } from "react";
import { View, Text, ScrollView, Image, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { setToken } from "../api";
import { C } from "../theme";
import DashboardScreen from "./DashboardScreen";
import CustomerHome from "./CustomerHome";
import MarketScreen from "./MarketScreen";
import ScanScreen from "./ScanScreen";
import VerifyResultScreen from "./VerifyResultScreen";
import CheckoutScreen from "./CheckoutScreen";
import CreateBatchScreen from "./CreateBatchScreen";
import UnitTransferScreen from "./UnitTransferScreen";
import BottomBar from "../components/BottomBar";
import Btn from "../components/Btn";

const FORECAST = { screen: "Dashboard", params: { path: "/ai/forecast" } };
const COLD = { screen: "Scan", params: { mode: "temp" } };
const RECEIVE = { screen: "Scan", params: { mode: "receive" } };
const PAYMENTS = { screen: "Dashboard", params: { path: "/payments/orders" } };
const CUSTOMER_TABS = [
  { id: "home", label: "Home", icon: "home-outline", on: "home" },
  { id: "verify", label: "Verify", icon: "shield-check-outline", on: "shield-check" },
  { id: "shop", label: "Shop", icon: "storefront-outline", on: "storefront" },
  { id: "orders", label: "Orders", icon: "clipboard-text-outline", on: "clipboard-text" },
  { id: "profile", label: "Profile", icon: "account-outline", on: "account" },
];
const ROLE_TABS = {
  manufacturer: [
    { id: "home", label: "Home", icon: "home-outline", on: "home" },
    { id: "create", label: "Create", icon: "plus-box-outline", action: { screen: "CreateBatch" } },
    { id: "cold", label: "Cold chain", icon: "thermometer", action: COLD },
    { id: "forecast", label: "Forecast", icon: "chart-line", action: FORECAST },
    { id: "profile", label: "Profile", icon: "account-outline", on: "account" },
  ],
  distributor: [
    { id: "home", label: "Home", icon: "home-outline", on: "home" },
    { id: "receive", label: "Receive", icon: "truck-delivery-outline", action: RECEIVE },
    { id: "cold", label: "Cold chain", icon: "thermometer", action: COLD },
    { id: "forecast", label: "Forecast", icon: "chart-line", action: FORECAST },
    { id: "profile", label: "Profile", icon: "account-outline", on: "account" },
  ],
  pharmacy: [
    { id: "home", label: "Home", icon: "home-outline", on: "home" },
    { id: "receive", label: "Receive", icon: "truck-delivery-outline", action: RECEIVE },
    { id: "sell", label: "Record sale", icon: "cash-register", action: { screen: "Scan", params: { mode: "sell" } } },
    { id: "payments", label: "Payments", icon: "credit-card-outline", action: PAYMENTS },
    { id: "profile", label: "Profile", icon: "account-outline", on: "account" },
  ],
  admin: [
    { id: "home", label: "Home", icon: "home-outline", on: "home" },
    { id: "flags", label: "Flags", icon: "flag-outline", action: { screen: "Dashboard", params: { path: "/flags/" } } },
    { id: "anomalies", label: "Anomalies", icon: "shield-alert-outline", action: { screen: "Dashboard", params: { path: "/ai/anomalies" } } },
    { id: "report", label: "Risk report", icon: "file-chart-outline", action: { screen: "Dashboard", params: { path: "/ai/report" } } },
    { id: "profile", label: "Profile", icon: "account-outline", on: "account" },
  ],
};

function Profile({ user, role, onLogout }) {
  return <ScrollView contentContainerStyle={s.profile}>
    <Image source={require("../../assets/jar-qr.png")} style={s.profileImg} />
    <Text style={s.profileTitle}>Account profile</Text>
    <View style={s.profileCard}>
      <Text style={s.profileLabel}>Name</Text><Text style={s.profileValue}>{user?.name || "—"}</Text>
      <Text style={s.profileLabel}>Role</Text><Text style={s.profileValue}>{(user?.role || role || "").replace(/^./, (c) => c.toUpperCase()) || "—"}</Text>
      <Text style={s.profileLabel}>Email</Text><Text style={s.profileValue}>{user?.email || "—"}</Text>
      {!!user?.organization_name && <><Text style={s.profileLabel}>Organization</Text><Text style={s.profileValue}>{user.organization_name}</Text></>}
    </View>
    <Btn title="Log out" variant="primary" onPress={onLogout} />
  </ScrollView>;
}

export default function HomeScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { role, user } = route.params;
  const tabs = role === "customer" ? CUSTOMER_TABS : (ROLE_TABS[role] || ROLE_TABS.admin);
  const [tab, setTab] = useState("home");
  const [pageStack, setPageStack] = useState([]);
  const page = pageStack[pageStack.length - 1];

  useLayoutEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);

  const logout = () => {
    setToken(null);
    navigation.reset({ index: 0, routes: [{ name: "Login" }] });
  };
  const openPage = (screen, params = {}) => setPageStack((stack) => [...stack, { screen, params }]);
  const backPage = () => setPageStack((stack) => stack.slice(0, -1));
  const shellNavigation = {
    ...navigation,
    navigate: (screen, params) => {
      if (screen === "Home") { setPageStack([]); setTab("home"); return; }
      openPage(screen, params);
    },
    replace: (screen, params) => setPageStack((stack) => [...stack.slice(0, -1), { screen, params }]),
    goBack: backPage,
  };

  const onTab = (id) => {
    setPageStack([]);
    setTab(id);
    if (role !== "customer") {
      const selected = tabs.find((item) => item.id === id);
      if (selected?.action) openPage(selected.action.screen, selected.action.params);
    }
  };

  const renderPage = () => {
    if (!page) {
      if (tab === "profile") return <Profile user={user} role={role} onLogout={logout} />;
      if (role === "customer") {
        if (tab === "home") return <CustomerHome navigation={shellNavigation} go={setTab} />;
        if (tab === "shop") return <MarketScreen navigation={shellNavigation} />;
        if (tab === "orders") return <DashboardScreen route={{ params: { path: "/payments/orders" } }} navigation={shellNavigation} />;
        if (tab === "verify") return <ScanScreen route={{ params: { mode: "verify" } }} navigation={shellNavigation} />;
      }
      return <DashboardScreen route={{ params: { role } }} navigation={shellNavigation} />;
    }
    if (page.screen === "Scan") return <ScanScreen route={{ params: page.params }} navigation={shellNavigation} />;
    if (page.screen === "VerifyResult") return <VerifyResultScreen route={{ params: page.params }} navigation={shellNavigation} />;
    if (page.screen === "Checkout") return <CheckoutScreen route={{ params: page.params }} navigation={shellNavigation} />;
    if (page.screen === "CreateBatch") return <CreateBatchScreen />;
    if (page.screen === "UnitTransfers") return <UnitTransferScreen route={{ params: page.params }} />;
    if (page.screen === "Dashboard") return <DashboardScreen route={{ params: page.params }} navigation={shellNavigation} />;
    return null;
  };

  return <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
    <View style={{ flex: 1 }}>{renderPage()}</View>
    <BottomBar active={tab} onChange={onTab} tabs={tabs} />
  </View>;
}

const s = StyleSheet.create({
  profile: { padding: 20, paddingBottom: 30 },
  profileImg: { width: "100%", height: 190, borderRadius: 18, marginBottom: 18 },
  profileTitle: { fontSize: 24, fontWeight: "bold", color: C.navy, marginBottom: 12 },
  profileCard: { backgroundColor: C.card, padding: 18, borderRadius: 16, marginBottom: 10, elevation: 3 },
  profileLabel: { fontSize: 12, fontWeight: "700", color: C.muted, marginTop: 8 },
  profileValue: { fontSize: 17, color: C.navy, fontWeight: "600", marginTop: 2 },
});
