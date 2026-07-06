import Feather from "@expo/vector-icons/Feather";
import { RouteProp, useRoute, useTheme } from "@react-navigation/native";
import * as MediaLibrary from "expo-media-library";
import { DateTime } from "luxon";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Switch, View } from "react-native";
import { SelectVideoMetadata } from "../../db/schema";
import { ExportScreenURI } from "../../navigation";
import { ExportStackParamList } from "../../navigation/ExportNavigation";
import { SafeTabBarZone } from "../../components/SafeTabBarZone";
import { SegmentedControl } from "../../components/SegmentedControl";
import { MyAppText } from "../../components/text/MyAppText";
import { ThemedButton } from "../../components/ThemedButton";
import { getSelectedVideosMetadataInRange } from "../../services/metadata";
import {
  computeMontageDurationMs,
  estimateFileSizeBytes,
  groupClipsForPeriod,
  PeriodClips,
} from "../../services/montage";
import preferences from "../../services/preferences";
import { formatBytes, formatDurationMs } from "../../utils/formatDuration";
import { usePeriod } from "../CameraRoll/hooks/usePeriod";
import { OptionLine } from "../Options/OptionLine";
import { OptionSection } from "../Options/OptionSection";

const DAY_MS = 86_400_000;

// Phase 2 note: the render target is assumed 1080p30 for the size estimate until the
// analyzeClips-driven quality picker lands (§4.1, phasing §10.5).
const ASSUMED_FPS = 30;

// Stats + options + export actions for one period (§9.2–9.3).
export function ExportScreen() {
  const route = useRoute<RouteProp<ExportStackParamList, typeof ExportScreenURI>>();
  const { periods } = usePeriod();
  const period = periods?.find((p) => p.id === route.params.periodId);

  const { dayShift } = preferences.useDayShiftPreference();

  // Export options (§9.3) — global prefs, updated in place
  const { exportShowDate, saveExportShowDate } = preferences.useExportShowDatePreference();
  const { exportShowHour, saveExportShowHour } = preferences.useExportShowHourPreference();
  const { exportShowTitle, saveExportShowTitle } = preferences.useExportShowTitlePreference();
  const { exportMissingDays, saveExportMissingDays } = preferences.useExportMissingDaysPreference();
  const { exportMissingDayDurationMs, saveExportMissingDayDurationMs } =
    preferences.useExportMissingDayDurationMsPreference();
  const { exportOrientation, saveExportOrientation } = preferences.useExportOrientationPreference();

  const [metadataList, setMetadataList] = useState<SelectVideoMetadata[]>();

  useEffect(() => {
    if (period === undefined) {
      return;
    }
    let cancelled = false;
    // ±1 day buffer for day-shifted boundary videos, same as useYearCompletion
    getSelectedVideosMetadataInRange(
      new Date(period.endDate.getTime() - DAY_MS),
      new Date(period.startDate.getTime() + DAY_MS)
    ).then((metadata) => {
      if (!cancelled) {
        setMetadataList(metadata);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [period?.startDate.getTime(), period?.endDate.getTime()]);

  const clips = useMemo(() => {
    if (period === undefined || metadataList === undefined || dayShift === undefined) {
      return undefined;
    }
    return groupClipsForPeriod(period, metadataList, dayShift || { hour: 0, minute: 0 });
  }, [period, metadataList, dayShift]);

  const untrimmed = useUntrimmedDurations(clips?.untrimmedClips);

  const optionsLoaded =
    exportShowDate !== undefined &&
    exportShowHour !== undefined &&
    exportShowTitle !== undefined &&
    exportMissingDays !== undefined &&
    exportMissingDayDurationMs !== undefined &&
    exportOrientation !== undefined;

  if (period === undefined || clips === undefined || !optionsLoaded) {
    return (
      <View style={{ padding: 30, alignItems: "center" }}>
        <MyAppText italic>Analyzing period...</MyAppText>
      </View>
    );
  }

  const renderSize = exportOrientation === "portrait" ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };

  const montageDurationMs =
    untrimmed === undefined
      ? undefined
      : computeMontageDurationMs(clips, untrimmed.totalMs, {
          showMissingDays: exportMissingDays === "show",
          missingDayDurationMs: exportMissingDayDurationMs,
        });

  return (
    <ScrollView style={{ paddingTop: 15 }}>
      <View style={{ gap: 20 }}>
        <StatsSection
          clips={clips}
          montageDurationMs={montageDurationMs}
          estimatedSizeBytes={
            montageDurationMs === undefined
              ? undefined
              : estimateFileSizeBytes(montageDurationMs, renderSize, ASSUMED_FPS)
          }
          unavailableCount={untrimmed?.unavailableIds.length ?? 0}
        />

        <OptionSection
          title="Options"
          Icon={({ theme: { colors } }) => <Feather name="sliders" size={25} color={colors.text} />}
        >
          <BooleanOptionLine label="Date overlay" value={exportShowDate} onChange={saveExportShowDate} />
          <BooleanOptionLine label="Hour overlay" value={exportShowHour} onChange={saveExportShowHour} />
          <BooleanOptionLine label="Title overlay" value={exportShowTitle} onChange={saveExportShowTitle} />

          <OptionLine label="Missing days">
            <SegmentedControl
              size={14}
              options={[
                { label: "Show", value: "show" },
                { label: "Skip", value: "skip" },
              ]}
              selectedValue={exportMissingDays}
              onValueChange={saveExportMissingDays}
            />
          </OptionLine>

          {exportMissingDays === "show" && (
            <OptionLine label="Beat duration">
              <SegmentedControl
                size={14}
                options={missingDayDurationOptions(exportMissingDayDurationMs)}
                selectedValue={exportMissingDayDurationMs.toString()}
                onValueChange={(value) => saveExportMissingDayDurationMs(Number(value))}
              />
            </OptionLine>
          )}

          <OptionLine label="Orientation">
            <SegmentedControl
              size={14}
              options={[
                { label: "Landscape", value: "landscape" },
                { label: "Portrait", value: "portrait" },
              ]}
              selectedValue={exportOrientation}
              onValueChange={saveExportOrientation}
            />
          </OptionLine>
        </OptionSection>

        <View style={{ gap: 10, marginHorizontal: 10 }}>
          <Pressable onPress={() => Alert.alert("Preview", "The preview render lands with the export engine.")}>
            <ThemedButton
              variant="outline"
              themeColor="primary"
              text="Preview"
              Icon={({ theme }) => <Feather name="play" size={20} color={theme.colors.primary} />}
            />
          </Pressable>
          <Pressable onPress={() => Alert.alert("Create the video", "The export engine is coming in the next phase.")}>
            <ThemedButton
              themeColor="primary"
              text="Create the video"
              Icon={({ theme }) => <Feather name="film" size={20} color={theme.colors.textOnPrimary} />}
            />
          </Pressable>
        </View>

        <SafeTabBarZone />
      </View>
    </ScrollView>
  );
}

// ----------------------------------------------------------------------------------------------------
// Stats (§9.2)

interface StatsSectionProps {
  clips: PeriodClips;
  montageDurationMs: number | undefined;
  estimatedSizeBytes: number | undefined;
  unavailableCount: number;
}

function StatsSection({ clips, montageDurationMs, estimatedSizeBytes, unavailableCount }: StatsSectionProps) {
  const theme = useTheme();
  const [showMissingDays, setShowMissingDays] = useState(false);

  return (
    <OptionSection
      title="Montage"
      Icon={({ theme: { colors } }) => <Feather name="film" size={25} color={colors.text} />}
    >
      <OptionLine label="Days filled">
        <MyAppText size={16}>{`${clips.filledDaysCount} / ${clips.totalDays}`}</MyAppText>
      </OptionLine>

      <Pressable onPress={() => setShowMissingDays((v) => !v)} disabled={clips.missingDays.length === 0}>
        <OptionLine label="Missing days">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <MyAppText size={16}>{clips.missingDays.length.toString()}</MyAppText>
            {clips.missingDays.length > 0 && (
              <Feather name={showMissingDays ? "chevron-up" : "chevron-down"} size={18} color={theme.colors.text} />
            )}
          </View>
        </OptionLine>
      </Pressable>

      {showMissingDays && (
        <View style={{ gap: 3, paddingLeft: 10 }}>
          {clips.missingDays.map((day) => (
            <MyAppText key={day.toDateString()} size={13} italic>
              {DateTime.fromJSDate(day).toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY)}
            </MyAppText>
          ))}
        </View>
      )}

      <OptionLine label="Total duration">
        <MyAppText size={16}>{montageDurationMs === undefined ? "..." : formatDurationMs(montageDurationMs)}</MyAppText>
      </OptionLine>

      <OptionLine label="Estimated size">
        <MyAppText size={16}>{estimatedSizeBytes === undefined ? "..." : `~${formatBytes(estimatedSizeBytes)}`}</MyAppText>
      </OptionLine>

      {clips.untrimmedClips.length > 0 && (
        <MyAppText size={13} italic>
          {`⚠ ${clips.untrimmedClips.length} clip${
            clips.untrimmedClips.length > 1 ? "s" : ""
          } not trimmed — full length will be used`}
        </MyAppText>
      )}

      {unavailableCount > 0 && (
        <MyAppText size={13} italic>
          {`⚠ ${unavailableCount} selected clip${
            unavailableCount > 1 ? "s" : ""
          } no longer found in the Photos library`}
        </MyAppText>
      )}
    </OptionSection>
  );
}

function BooleanOptionLine({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <OptionLine label={label}>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: theme.colors.primary }} />
    </OptionLine>
  );
}

function missingDayDurationOptions(currentValue: number) {
  const presets = [250, 500, 1000];
  const values = presets.includes(currentValue) ? presets : [...presets, currentValue].sort((a, b) => a - b);
  return values.map((v) => ({ label: `${(v / 1000).toLocaleString()} s`, value: v.toString() }));
}

// ----------------------------------------------------------------------------------------------------
// Full durations of untrimmed clips, fetched from the media library (their whole
// length goes into the montage). Deleted assets are collected as unavailable.

function useUntrimmedDurations(untrimmedClips: SelectVideoMetadata[] | undefined) {
  const [result, setResult] = useState<{ totalMs: number; unavailableIds: string[] }>();

  useEffect(() => {
    if (untrimmedClips === undefined) {
      return;
    }
    let cancelled = false;

    (async () => {
      let totalMs = 0;
      const unavailableIds: string[] = [];
      for (const clip of untrimmedClips) {
        try {
          const info = await MediaLibrary.getAssetInfoAsync(clip.videoId);
          totalMs += info.duration * 1000;
        } catch (e) {
          unavailableIds.push(clip.videoId);
        }
      }
      if (!cancelled) {
        setResult({ totalMs, unavailableIds });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [untrimmedClips]);

  return result;
}
