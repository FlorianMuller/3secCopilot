import Feather from "@expo/vector-icons/Feather";
import { Pressable, StyleSheet, View } from "react-native";
import { MyAppText } from "../../components/text/MyAppText";
import { ThemedButton } from "../../components/ThemedButton";

interface YearProgressHeaderProps {
  selectedDaysCount: number;
  totalDays: number;
  showOnlyUnselected: boolean;
  onToggleFilter: () => void;
}

// Top bar of the camera roll: year completion status (percentage + day count) and a toggle to filter
// the list down to days that still have no selected video. The top padding clears the floating
// PeriodSelector, replacing the spacer that previously offset the first day section.
export function YearProgressHeader({
  selectedDaysCount,
  totalDays,
  showOnlyUnselected,
  onToggleFilter,
}: YearProgressHeaderProps) {
  const percentage = totalDays > 0 ? Math.round((selectedDaysCount / totalDays) * 100) : 0;
  const missingDays = Math.max(totalDays - selectedDaysCount, 0);

  return (
    <View style={styles.container}>
      <View style={styles.status}>
        <MyAppText weight={800} size={17}>
          {percentage} %
        </MyAppText>
        <MyAppText size={14} style={styles.count}>
          · {missingDays} jours sans vidéo
        </MyAppText>
      </View>

      <Pressable onPress={onToggleFilter} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
        <ThemedButton
          Icon={({ iconProps }) => <Feather name="filter" {...iconProps} />}
          text="Sans sélection"
          size={14}
          variant={showOnlyUnselected ? "filled" : "outline"}
          themeColor={showOnlyUnselected ? "primary" : "secondary"}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 70,
    paddingHorizontal: 10,
    marginBottom: 20,
  },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  count: {
    opacity: 0.7,
  },
});
