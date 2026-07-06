import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation, useTheme } from "@react-navigation/native";
import { FlatList, Pressable, View } from "react-native";
import { ExportScreenURI } from "../../navigation";
import { ExportNavigationProp } from "../../navigation/ExportNavigation";
import { Card } from "../../components/card";
import { SafeTabBarZone } from "../../components/SafeTabBarZone";
import { MyAppText } from "../../components/text/MyAppText";
import { formatDurationMs } from "../../utils/formatDuration";
import { ExportPeriodSummary, useExportPeriods } from "./hooks/useExportPeriods";
import { PeriodThumbnail } from "./PeriodThumbnail";

// Export tab root (§9.1): one row per period that has at least one selected video.
export function PeriodList() {
  const { summaries } = useExportPeriods();

  if (summaries === undefined) {
    return (
      <View style={{ padding: 30, alignItems: "center" }}>
        <MyAppText italic>Loading periods...</MyAppText>
      </View>
    );
  }

  if (summaries.length === 0) {
    return (
      <View style={{ padding: 30, alignItems: "center", gap: 10 }}>
        <MyAppText size={18} weight={600}>
          Nothing to export yet
        </MyAppText>
        <MyAppText italic style={{ textAlign: "center" }}>
          Select videos in the Videos tab — each period with at least one selected video will appear here.
        </MyAppText>
      </View>
    );
  }

  return (
    <FlatList
      data={summaries}
      keyExtractor={(summary) => summary.period.id}
      contentContainerStyle={{ paddingTop: 15, gap: 10 }}
      renderItem={({ item }) => <PeriodRow summary={item} />}
      ListFooterComponent={SafeTabBarZone}
    />
  );
}

function PeriodRow({ summary }: { summary: ExportPeriodSummary }) {
  const navigation = useNavigation<ExportNavigationProp>();
  const theme = useTheme();
  const { period, clips } = summary;

  return (
    <Pressable
      onPress={() => navigation.navigate(ExportScreenURI, { periodId: period.id, periodLabel: period.label })}
    >
      <Card style={{ marginHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <PeriodThumbnail videoId={clips.firstClipId} />

        <View style={{ flex: 1, gap: 2 }}>
          <MyAppText size={20} weight={700}>
            {period.label}
          </MyAppText>
          <MyAppText size={14}>{`${clips.filledDaysCount}/${clips.totalDays} days`}</MyAppText>
          <MyAppText size={14} italic>
            {formatDurationMs(clips.trimmedDurationMs)}
            {clips.untrimmedClips.length > 0 ? ` + ${clips.untrimmedClips.length} untrimmed` : ""}
          </MyAppText>
        </View>

        <Ionicons name="chevron-forward" size={22} color={theme.colors.text} />
      </Card>
    </Pressable>
  );
}
