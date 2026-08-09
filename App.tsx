import Ionicons from "@expo/vector-icons/Ionicons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer } from "@react-navigation/native";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { useDrizzleStudio } from "expo-drizzle-studio-plugin";
import { useEffect } from "react";
import { Text, useColorScheme, View } from "react-native";
import { gestureHandlerRootHOC, GestureHandlerRootView } from "react-native-gesture-handler";
import migrations from "./drizzle/migrations";
import { FloatingTabBar } from "./src/components/MyTabBar";
import { DynamicBottomSheetProvider } from "./src/contexts/DynamicBottomSheetContext";
import { db, expoSqliteDb } from "./src/db/db";
import { CameraRollNavigation } from "./src/navigation/CameraRollNavigation";
import { ExportNavigation } from "./src/navigation/ExportNavigation";
import { seedBatchRepro, seedDemoData } from "./src/services/devSeed";
import { OptionsNavigation } from "./src/navigation/OptionsNavigation";
import { myDarkTheme, myLightTheme } from "./src/theme/themes";
import "./src/utils/polyfills";

const Tab = createBottomTabNavigator();

interface AppTabsProps {
  theme: "light" | "dark";
}

// Dev automation hooks (simulator testing, no-ops in release builds):
//   EXPO_PUBLIC_AUTOSEED=1     seed demo data on startup (services/devSeed.ts)
//   EXPO_PUBLIC_INITIAL_TAB=…  open a given tab on startup (e.g. ExportTab)
const devInitialTab = (__DEV__ && process.env.EXPO_PUBLIC_INITIAL_TAB) || "CameraRollTab";

function useDevAutoSeed() {
  useEffect(() => {
    if (__DEV__ && process.env.EXPO_PUBLIC_SEED_BATCH) {
      seedBatchRepro()
        .then((status) => console.log(`[autoseed] ${status}`))
        .catch((e) => console.error("[autoseed] failed:", e));
    } else if (__DEV__ && process.env.EXPO_PUBLIC_AUTOSEED) {
      seedDemoData()
        .then((status) => console.log(`[autoseed] ${status}`))
        .catch((e) => console.error("[autoseed] failed:", e));
    }
  }, []);
}

function AppTabs({ theme }: AppTabsProps) {
  useDevAutoSeed();

  return (
    <NavigationContainer theme={theme === "dark" ? myDarkTheme : myLightTheme}>
      <DynamicBottomSheetProvider>
        <Tab.Navigator
          initialRouteName={devInitialTab}
          screenOptions={{
            headerShown: false,
          }}
          tabBar={(props) => <FloatingTabBar {...props} />}
        >
          <Tab.Screen
            name="CameraRollTab"
            component={gestureHandlerRootHOC(CameraRollNavigation)}
            options={{
              title: "Videos",
              tabBarIcon: ({ focused, color, size }) => (
                <Ionicons name={focused ? "images" : "images-outline"} size={size} color={color} />
              ),
            }}
          />
          <Tab.Screen
            name="ExportTab"
            component={gestureHandlerRootHOC(ExportNavigation)}
            options={{
              title: "Export",
              tabBarIcon: ({ focused, color, size }) => (
                <Ionicons name={focused ? "film" : "film-outline"} size={size} color={color} />
              ),
            }}
          />
          <Tab.Screen
            name="OptionsTab"
            component={gestureHandlerRootHOC(OptionsNavigation)}
            options={{
              title: "Settings",
              tabBarIcon: ({ focused, color, size }) => (
                <Ionicons name={focused ? "cog" : "cog-outline"} size={size} color={color} />
              ),
            }}
          />
        </Tab.Navigator>
      </DynamicBottomSheetProvider>
    </NavigationContainer>
  );
}

// Wrapper component so useDrizzleStudio is never called conditionally
function DrizzleStudio() {
  useDrizzleStudio(expoSqliteDb);
  return null;
}

export default function App() {
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

  return (
    <GestureHandlerRootView>
      {/* Allow to view database in a web UI (only in development) */}
      {__DEV__ && <DrizzleStudio />}
      <AppTabs theme={scheme || "light"} />
    </GestureHandlerRootView>
  );
}
