import { createNativeStackNavigator, NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ExportScreenURI, PeriodListURI } from ".";
import { ExportScreen } from "../features/Export/ExportScreen";
import { PeriodList } from "../features/Export/PeriodList";

export type ExportStackParamList = {
  [PeriodListURI]: undefined;
  // The period is passed by id (Dates don't serialize well as params) and resolved
  // with usePeriod inside the screen
  [ExportScreenURI]: { periodId: string; periodLabel: string };
};

// To type the `useNavigation()` hook
export type ExportNavigationProp = NativeStackNavigationProp<ExportStackParamList>;

const ExportStack = createNativeStackNavigator<ExportStackParamList>();

export function ExportNavigation() {
  return (
    <ExportStack.Navigator initialRouteName={PeriodListURI} screenOptions={{ headerShown: true }}>
      <ExportStack.Screen name={PeriodListURI} component={PeriodList} options={{ title: "Export" }} />
      <ExportStack.Screen
        name={ExportScreenURI}
        component={ExportScreen}
        options={({ route }) => ({ title: route.params.periodLabel })}
      />
    </ExportStack.Navigator>
  );
}
