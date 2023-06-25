import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { memo, PropsWithChildren } from "react";
import { StyleSheet, Text, View } from "react-native";
import CameraRoll from "./src/features/CameraRoll/CameraRoll";
import { Options } from "./src/features/Options/Options";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { CameraRollNavigation } from "./src/navigation/CameraRollNavigation";
import { OptionsNavigation } from "./src/navigation/OptionsNavigation";

export function AppLayout({ children }: PropsWithChildren<{}>) {
  return <View style={styles.root}>{children}</View>;
}

const Tab = createBottomTabNavigator();

function AppTabs() {
  return (
    <NavigationContainer>
      <Tab.Navigator initialRouteName="CameraRollTab" screenOptions={{ headerShown: false }}>
        <Tab.Screen name="CameraRollTab" component={CameraRollNavigation} />
        <Tab.Screen name="OptionsTab" component={OptionsNavigation} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return <AppTabs />;
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "black",
    height: "100%",
    color: "white",
  },
});
