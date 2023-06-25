import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { memo } from "react";
import { AppLayout } from "../../App";
import CameraRoll from "../features/CameraRoll/CameraRoll";
import { Options } from "../features/Options/Options";

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
