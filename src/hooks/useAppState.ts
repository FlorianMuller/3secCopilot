import { useEffect } from "react";
import { AppState, AppStateStatus } from "react-native";

export const useAppState = (onActive?: () => void, onBackground?: () => void) => {
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "active" && onActive) {
        onActive();
      } else if (nextAppState === "background" && onBackground) {
        onBackground();
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      subscription?.remove();
    };
  }, [onActive, onBackground]);
};
