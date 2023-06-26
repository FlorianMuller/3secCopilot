import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { memo, useEffect } from "react";
import { CameraRollURI, VideoPlayerURI } from ".";
import App, { AppLayout } from "../../App";
import CameraRoll from "../features/CameraRoll/CameraRoll";
import { VideoPlayer } from "../features/CameraRoll/VideoPlayer/VideoPlayer";

export type CameraRollStackParamList = {
  [CameraRollURI]: undefined;
  [VideoPlayerURI]: { id: string };
};

const CameraRollStack = createNativeStackNavigator<CameraRollStackParamList>();

export function CameraRollNavigation() {
  return (
    <CameraRollStack.Navigator initialRouteName={CameraRollURI} screenOptions={{ headerShown: true }}>
      <CameraRollStack.Screen
        name={CameraRollURI}
        component={memo(() => (
          <AppLayout>
            <CameraRoll startDate={new Date()} />
          </AppLayout>
        ))}
        options={{ headerShown: false }}
      />
      <CameraRollStack.Screen
        name={VideoPlayerURI}
        component={memo(() => (
          <AppLayout>
            <VideoPlayer />
          </AppLayout>
        ))}
      />
    </CameraRollStack.Navigator>
  );
}
