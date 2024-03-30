import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { useColorScheme } from "react-native";
import { CameraRollNavigation } from "./src/navigation/CameraRollNavigation";
import { OptionsNavigation } from "./src/navigation/OptionsNavigation";
import Ionicons from "@expo/vector-icons/Ionicons";
import { FloatingTabBar } from "./src/components/MyTabBar";
import { memo } from "react";

const Tab = createBottomTabNavigator();

interface AppTabsProps {
  theme: "light" | "dark";
}

function AppTabs({ theme }: AppTabsProps) {
  return (
    <NavigationContainer theme={theme === "dark" ? DarkTheme : DefaultTheme}>
      <Tab.Navigator
        initialRouteName="CameraRollTab"
        screenOptions={{
          headerShown: false,
        }}
        tabBar={(props) => <FloatingTabBar {...props} />}
      >
        <Tab.Screen
          name="CameraRollTab"
          component={CameraRollNavigation}
          options={{
            title: "Videos",
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons name={focused ? "images" : "images-outline"} size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Preview"
          component={memo(() => (
            <></>
          ))}
          options={{
            title: "Preview",
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons name={focused ? "play-circle" : "play-circle-outline"} size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="OptionsTab"
          component={OptionsNavigation}
          options={{
            title: "Settings",
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons name={focused ? "cog" : "cog-outline"} size={size} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const scheme = useColorScheme();

  return <AppTabs theme={scheme || "light"} />;
}
