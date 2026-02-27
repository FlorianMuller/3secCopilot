import { LinearGradient } from "expo-linear-gradient";
import CameraRoll from "./CameraRoll";
import { PeriodSelector } from "./PeriodSelector";
import { View } from "react-native";
import { usePeriod } from "./hooks/usePeriod";

export function CameraRollPage() {
  const { periods, selectedPeriod, setSelectedPeriodId } = usePeriod();

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
          <PeriodSelector periods={periods} selectedPeriod={selectedPeriod} onSelectPeriod={setSelectedPeriodId} />
          {/* Offset CameraRoll start to not appear under PeriodSelector: */}
          <View style={{ height: 25 }} />

          <CameraRoll startDate={selectedPeriod.startDate} endDate={selectedPeriod.endDate} key={selectedPeriod.id} />
        </>
      )}
    </>
  );
}
