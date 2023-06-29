import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Options } from "../features/Options/Options";

const OptionsStack = createNativeStackNavigator();

export function OptionsNavigation() {
  return (
    <OptionsStack.Navigator initialRouteName="Options">
      <OptionsStack.Screen name="Options" component={Options} />
    </OptionsStack.Navigator>
  );
}
