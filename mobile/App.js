import { Alert } from "react-native";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { setUnauthorizedHandler } from "./src/api";
import LoginScreen from "./src/screens/LoginScreen";
import RegisterScreen from "./src/screens/RegisterScreen";
import HomeScreen from "./src/screens/HomeScreen";
import CreateBatchScreen from "./src/screens/CreateBatchScreen";
import ScanScreen from "./src/screens/ScanScreen";
import VerifyResultScreen from "./src/screens/VerifyResultScreen";
import DashboardScreen from "./src/screens/DashboardScreen";
import CheckoutScreen from "./src/screens/CheckoutScreen";
import { C } from "./src/theme";

const Stack = createNativeStackNavigator();
const navRef = createNavigationContainerRef();

// Any screen that gets a 401 sends the user back to Login
setUnauthorizedHandler(() => {
  if (navRef.isReady()) {
    navRef.reset({ index: 0, routes: [{ name: "Login" }] });
    Alert.alert("Session expired", "Please log in again.");
  }
});

export default function App() {
  return (
    <NavigationContainer ref={navRef}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: C.navy },
          headerTintColor: C.bg,
          headerTitleStyle: { fontWeight: "600" },
          contentStyle: { backgroundColor: C.bg },
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerBackVisible: false }} />
        <Stack.Screen name="CreateBatch" component={CreateBatchScreen} options={{ title: "Create batch" }} />
        <Stack.Screen name="Scan" component={ScanScreen} options={{ title: "Scan QR" }} />
        <Stack.Screen name="VerifyResult" component={VerifyResultScreen} options={{ title: "Verification" }} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: "Dashboard" }} />
        <Stack.Screen name="Checkout" component={CheckoutScreen} options={{ title: "Checkout" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
