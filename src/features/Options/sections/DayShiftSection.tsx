import { MyAppText } from "../../../components/text/MyAppText";
import preferences from "../../../services/preferences";
import { OptionSection } from "../OptionSection";
import Feather from "@expo/vector-icons/Feather";

export interface DayShiftTime {
  minute: number;
  hour: number;
}

export function DayShiftSection() {
  const { dayShift, saveDayShift } = preferences.useDayShiftPreference();
  return (
    <OptionSection
      title="Day shift"
      description="As we sometimes live and go to bed past midnight, this option allow you to assign video past midnight and unit x hour to the previous day"
      Icon={({ theme: { colors } }) => <Feather name="moon" size={29} color={colors.text} />}
    >
      <MyAppText>Shift Day at ...</MyAppText>
      {/* todo: add picker */}
    </OptionSection>
  );
}
