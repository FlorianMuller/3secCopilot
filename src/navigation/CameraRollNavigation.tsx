import { createNativeStackNavigator, NativeStackNavigationProp } from "@react-navigation/native-stack";
import { memo, useEffect } from "react";
import { CameraRollURI, VideoPlayerURI } from ".";
import CameraRoll from "../features/CameraRoll/CameraRoll";
import { VideoPlayer } from "../features/CameraRoll/VideoPlayer/VideoPlayer";
import { AppLayout } from "../../AppLayout";

export type CameraRollStackParamList = {
  [CameraRollURI]: undefined;
  [VideoPlayerURI]: { day: Date; ids: string[]; index: number };
};

// To type the `useNavigation()` hook
export type CameraRollNavigationProp = NativeStackNavigationProp<CameraRollStackParamList>;

const CameraRollStack = createNativeStackNavigator<CameraRollStackParamList>();

export function CameraRollNavigation() {
  return (
    <CameraRollStack.Navigator initialRouteName={CameraRollURI} screenOptions={{ headerShown: true }}>
      <CameraRollStack.Screen name={CameraRollURI} component={CameraRoll} options={{ headerShown: false }} />
      <CameraRollStack.Screen name={VideoPlayerURI} component={VideoPlayer} />
    </CameraRollStack.Navigator>
  );
}
