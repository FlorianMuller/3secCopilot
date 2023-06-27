import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { memo } from "react";
import { Options } from "../features/Options/Options";
import { AppLayout } from "../../AppLayout";

const OptionsStack = createNativeStackNavigator();

export function OptionsNavigation() {
  return (
    <OptionsStack.Navigator initialRouteName="Options">
      <OptionsStack.Screen
        name="Options"
        component={memo(() => (
          <AppLayout>
            <Options />
          </AppLayout>
        ))}
      />
    </OptionsStack.Navigator>
  );
}
