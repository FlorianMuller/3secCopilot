import { LinearGradient } from "expo-linear-gradient";
import CameraRoll from "./CameraRoll";
import { PeriodSelector } from "./PeriodSelector";
import { View } from "react-native";
import { usePeriod } from "./hooks/usePeriod";

export function CameraRollPage() {
  const startDate = new Date(); // Today at 23:59:59
  startDate.setHours(23, 59, 59, 999);
  const endDate = new Date(new Date().getFullYear(), 0, 1); // January 1st of current year

  const { periods, selectedPeriod, setSelectedPeriodId } = usePeriod();

  return (
    <>
      {/* Linear gradient between thumbnails and phone status bar (time, wifi icon...) */}
      {/* Todo: compute dynamically status bar size */}
      <LinearGradient
        colors={["rgba(0, 0, 0, 0.6)", "rgba(0, 0, 0, 0)"]}
        style={{ width: "100%", height: 80, position: "absolute", zIndex: 100 }}
      />

      <PeriodSelector periods={periods} selectedPeriod={selectedPeriod} onSelectPeriod={setSelectedPeriodId} />
      {/* Offset CameraRoll start to not appear under PeriodSelector: */}
      <View style={{ height: 25 }} />

      <CameraRoll startDate={selectedPeriod.startDate} endDate={selectedPeriod.endDate} key={selectedPeriod.id} />
    </>
  );
}
