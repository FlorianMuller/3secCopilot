import { LinearGradient } from "expo-linear-gradient";
import { View } from "react-native";
import CameraRoll from "./CameraRoll";
import { PeriodProvider, usePeriodContext } from "./contexts/PeriodContext";
import { PeriodSelector } from "./PeriodSelector";

export function CameraRollPage() {
  return (
    <PeriodProvider>
      <CameraRollScreen />
    </PeriodProvider>
  );
}

function CameraRollScreen() {
  const { periods, selectedPeriod } = usePeriodContext();

  return (
    <>
      {/* Linear gradient between thumbnails and phone status bar (time, wifi icon...) */}
      {/* Todo: compute dynamically status bar size */}
      <LinearGradient
        colors={["rgba(0, 0, 0, 0.6)", "rgba(0, 0, 0, 0)"]}
        style={{ width: "100%", height: 80, position: "absolute", zIndex: 100 }}
      />

      {periods && selectedPeriod && (
        <>
          <PeriodSelector />
          {/* Offset CameraRoll start to not appear under PeriodSelector: */}
          <View style={{ height: 25 }} />

          {/* key resets all camera-roll state (videos, filters, caches) when switching periods */}
          <CameraRoll key={selectedPeriod.id} />
        </>
      )}
    </>
  );
}
