import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { useColorScheme } from "react-native";
import { CameraRollNavigation } from "./src/navigation/CameraRollNavigation";
import { OptionsNavigation } from "./src/navigation/OptionsNavigation";

const Tab = createBottomTabNavigator();

interface AppTabsProps {
  theme: "light" | "dark";
}

function AppTabs({ theme }: AppTabsProps) {
  return (
    <NavigationContainer theme={theme === "dark" ? DarkTheme : DefaultTheme}>
      <Tab.Navigator initialRouteName="CameraRollTab" screenOptions={{ headerShown: false }}>
        <Tab.Screen name="CameraRollTab" component={CameraRollNavigation} />
        <Tab.Screen name="OptionsTab" component={OptionsNavigation} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const scheme = useColorScheme();
  console.log("scheme", scheme);

  return <AppTabs theme={scheme || "light"} />;
}
