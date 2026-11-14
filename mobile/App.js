import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import LoginScreen from "./src/screens/LoginScreen";
import HomeScreen from "./src/screens/HomeScreen";
import RegisterScreen from "./src/screens/RegisterScreen";
import CreateBatchScreen from "./src/screens/CreateBatchScreen";
import ScanScreen from "./src/screens/ScanScreen";
import VerifyResultScreen from "./src/screens/VerifyResultScreen";
import DashboardScreen from "./src/screens/DashboardScreen";

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="CreateBatch" component={CreateBatchScreen} options={{ title: "Create batch" }} />
        <Stack.Screen name="Scan" component={ScanScreen} options={{ title: "Scan QR" }} />
        <Stack.Screen name="VerifyResult" component={VerifyResultScreen} options={{ title: "Verification" }} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: "Dashboard" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}