import Ionicons from "@expo/vector-icons/Ionicons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer } from "@react-navigation/native";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { useDrizzleStudio } from "expo-drizzle-studio-plugin";
import { Text, useColorScheme, View } from "react-native";
import { gestureHandlerRootHOC, GestureHandlerRootView } from "react-native-gesture-handler";
import migrations from "./drizzle/migrations";
import { FloatingTabBar } from "./src/components/MyTabBar";
import { DynamicBottomSheetProvider } from "./src/contexts/DynamicBottomSheetContext";
import { db, expoSqliteDb } from "./src/db/db";
import { Preview } from "./src/features/Preview/Preview";
import { CameraRollNavigation } from "./src/navigation/CameraRollNavigation";
import { OptionsNavigation } from "./src/navigation/OptionsNavigation";
import { myDarkTheme, myLightTheme } from "./src/theme/themes";
import "./src/utils/polyfills";

const Tab = createBottomTabNavigator();

interface AppTabsProps {
  theme: "light" | "dark";
}

function AppTabs({ theme }: AppTabsProps) {
  return (
    <NavigationContainer theme={theme === "dark" ? myDarkTheme : myLightTheme}>
      <DynamicBottomSheetProvider>
        <Tab.Navigator
          initialRouteName="CameraRollTab"
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
            name="Preview"
            component={gestureHandlerRootHOC(Preview)}
            options={{
              title: "Preview",
              tabBarIcon: ({ focused, color, size }) => (
                <Ionicons name={focused ? "play-circle" : "play-circle-outline"} size={size} color={color} />
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
