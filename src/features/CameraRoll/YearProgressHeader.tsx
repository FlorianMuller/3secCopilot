import { useTheme } from "@react-navigation/native";
import { Pressable, StyleSheet, View } from "react-native";
import { MyAppText } from "../../components/text/MyAppText";

interface YearProgressHeaderProps {
  selectedDaysCount: number;
  totalDays: number;
  showOnlyUnselected: boolean;
  onToggleFilter: () => void;
  showOnlyWithVideos: boolean;
  onToggleWithVideos: () => void;
}

const HIT_SLOP = { top: 15, bottom: 15, left: 15, right: 15 };

// Top bar of the camera roll: year completion status (percentage + day count). The day count doubles
// as the primary filter toggle — tapping it filters the list down to days that still have no selected
// video. It reads as plain text when off and becomes a filled pill when active. Once active, a second
// "avec vidéos" pill snaps onto its right (outline → filled) to further narrow to days that actually
// have videos to pick from. The top padding clears the floating PeriodSelector.
export function YearProgressHeader({
  selectedDaysCount,
  totalDays,
  showOnlyUnselected,
  onToggleFilter,
  showOnlyWithVideos,
  onToggleWithVideos,
}: YearProgressHeaderProps) {
  const { colors } = useTheme();
  const percentage = totalDays > 0 ? Math.round((selectedDaysCount / totalDays) * 100) : 0;
  const missingDays = Math.max(totalDays - selectedDaysCount, 0);

  return (
    <View style={styles.container}>
      <View style={styles.status}>
        <MyAppText weight={800} size={17}>
          {percentage} %
        </MyAppText>
        <MyAppText size={14}>·</MyAppText>

        {showOnlyUnselected ? (
          <View style={styles.pillGroup}>
            <Pressable
              onPress={onToggleFilter}
              hitSlop={HIT_SLOP}
              style={[styles.pill, styles.pillLeft, { backgroundColor: colors.primary, borderColor: colors.primary }]}
            >
              <MyAppText size={14} weight={700} color={colors.textOnPrimary}>
                {missingDays} jours sans vidéo
              </MyAppText>
            </Pressable>
            <Pressable
              onPress={onToggleWithVideos}
              hitSlop={HIT_SLOP}
              style={[
                styles.pill,
                styles.pillRight,
                {
                  backgroundColor: showOnlyWithVideos ? colors.secondary : "transparent",
                  borderColor: colors.secondary,
                },
              ]}
            >
              <MyAppText
                size={14}
                weight={showOnlyWithVideos ? 700 : 400}
                color={showOnlyWithVideos ? colors.textOnSecondary : colors.secondary}
              >
                avec vidéos
              </MyAppText>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={onToggleFilter} hitSlop={HIT_SLOP}>
            <MyAppText size={14} style={styles.count}>
              {missingDays} jours sans vidéo
            </MyAppText>
          </Pressable>
        )}
      </View>
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
  pillGroup: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    justifyContent: "center",
    borderWidth: 1.5,
  },
  pillLeft: {
    // Fully rounded and stacked on top, so it reads as the active pill sitting over the second one.
    borderRadius: 999,
    zIndex: 1,
  },
  pillRight: {
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
    borderLeftWidth: 0,
    // Tuck the left edge under the rounded left pill; extra left padding keeps the text clear of the overlap.
    marginLeft: -14,
    paddingLeft: 22,
  },
});
