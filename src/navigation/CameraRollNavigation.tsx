import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { memo } from "react";
import { CameraRollURI, VideoPlayerURI } from ".";
import App, { AppLayout } from "../../App";
import CameraRoll from "../features/CameraRoll/CameraRoll";
import { VideoPlayer } from "../features/CameraRoll/VideoPlayer/VideoPlayer";

const CameraRollStack = createNativeStackNavigator();

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
