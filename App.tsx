import Ionicons from "@expo/vector-icons/Ionicons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { drizzle } from "drizzle-orm/expo-sqlite";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import * as SQLite from "expo-sqlite";
import { memo } from "react";
import { Text, useColorScheme, View } from "react-native";
import migrations from "./drizzle/migrations";
import { FloatingTabBar } from "./src/components/MyTabBar";
import { CameraRollNavigation } from "./src/navigation/CameraRollNavigation";
import { OptionsNavigation } from "./src/navigation/OptionsNavigation";
import { db, expoSqliteDb } from "./src/db/db";
import { useDrizzleStudio } from "expo-drizzle-studio-plugin";

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
  // Allow to view database in a web UI
  useDrizzleStudio(expoSqliteDb);
  // Migrate database if table schemas have changed
  const { success, error } = useMigrations(db, migrations);
  const scheme = useColorScheme();

  if (error) {
    return (
      <View>
        <Text>Migration error: {error.message}</Text>
      </View>
    );
  }

  if (!success) {
    return (
      <View>
        <Text>Migration is in progress...</Text>
      </View>
    );
  }

  return <AppTabs theme={scheme || "light"} />;
}
