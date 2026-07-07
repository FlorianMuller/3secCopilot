import Feather from "@expo/vector-icons/Feather";
import { RouteProp, useRoute, useTheme } from "@react-navigation/native";
import * as FileSystem from "expo-file-system";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { DateTime } from "luxon";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Switch, View } from "react-native";
import { ExportPhase } from "../../../modules/expo-montage/src/ExpoMontage.types";
import { SelectVideoMetadata } from "../../db/schema";
import { ExportScreenURI } from "../../navigation";
import { ExportStackParamList } from "../../navigation/ExportNavigation";
import { SafeTabBarZone } from "../../components/SafeTabBarZone";
import { SegmentedControl } from "../../components/SegmentedControl";
import { MyAppText } from "../../components/text/MyAppText";
import { ThemedButton } from "../../components/ThemedButton";
import { getSelectedVideosMetadataInRange } from "../../services/metadata";
import {
  buildMontageClips,
  computeMontageDurationMs,
  estimateFileSizeBytes,
  EXPORT_CANCELLED_MESSAGE,
  EXPORT_FPS,
  getRenderSize,
  groupClipsForPeriod,
  MontageExportHandle,
  PeriodClips,
  startMontageExport,
} from "../../services/montage";
import preferences from "../../services/preferences";
import { formatBytes, formatDurationMs } from "../../utils/formatDuration";
import { usePeriod } from "../CameraRoll/hooks/usePeriod";
import { OptionLine } from "../Options/OptionLine";
import { OptionSection } from "../Options/OptionSection";

const DAY_MS = 86_400_000;

const KEEP_AWAKE_TAG = "montage-export";

// Export flow state machine (§9.5): idle → exporting → done | error
type ExportFlowState =
  | { status: "idle" }
  | { status: "exporting"; progress: number; phase: ExportPhase }
  | { status: "done"; outputPath: string; durationMs: number; fileSizeBytes: number; warnings: string[] }
  | { status: "error"; message: string };

// Dev automation hook (simulator testing): EXPO_PUBLIC_AUTO_EXPORT=1 auto-starts the
// export once the stats are loaded and logs progress lines a headless test can follow.
function autoExportLog(line: string) {
  if (__DEV__ && process.env.EXPO_PUBLIC_AUTO_EXPORT) {
    console.log(`[autoexport] ${line}`);
  }
}

function useDevAutoExport(statsReady: boolean, startExport: () => void) {
  const hasStarted = useRef(false);

  useEffect(() => {
    if (__DEV__ && process.env.EXPO_PUBLIC_AUTO_EXPORT && statsReady && !hasStarted.current) {
      hasStarted.current = true;
      autoExportLog("starting export");
      startExport();
    }
  }, [statsReady, startExport]);
}

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

  const [exportState, setExportState] = useState<ExportFlowState>({ status: "idle" });
  const exportHandleRef = useRef<MontageExportHandle | undefined>(undefined);

  // Detach the event listeners if the screen unmounts mid-export (the native task
  // keeps running; without a UI it is simply not observed anymore)
  useEffect(() => () => exportHandleRef.current?.removeListeners(), []);

  // The writer session dies on backgrounding (§9.5) — keep the screen awake while exporting
  const isExporting = exportState.status === "exporting";
  useEffect(() => {
    if (!isExporting) {
      return;
    }
    activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG);
    };
  }, [isExporting]);

  const startExport = useCallback(async () => {
    if (
      period === undefined ||
      clips === undefined ||
      exportMissingDays === undefined ||
      exportMissingDayDurationMs === undefined ||
      exportOrientation === undefined ||
      exportHandleRef.current !== undefined
    ) {
      return;
    }
    setExportState({ status: "exporting", progress: 0, phase: "download" });
    try {
      const montageClips = buildMontageClips(clips, {
        periodLabel: period.label,
        showMissingDays: exportMissingDays === "show",
        missingDayDurationMs: exportMissingDayDurationMs,
      });
      exportHandleRef.current = await startMontageExport(period.id, montageClips, exportOrientation, {
        onProgress: (event) => {
          autoExportLog(`phase=${event.phase} progress=${event.progress.toFixed(3)}`);
          setExportState({ status: "exporting", progress: event.progress, phase: event.phase });
        },
        onComplete: (event) => {
          exportHandleRef.current = undefined;
          autoExportLog(
            `DONE path=${event.outputPath} durationMs=${Math.round(event.durationMs)} sizeBytes=${
              event.fileSizeBytes
            } peakMB=${Math.round(event.peakMemoryMB)}`
          );
          setExportState({
            status: "done",
            outputPath: event.outputPath,
            durationMs: event.durationMs,
            fileSizeBytes: event.fileSizeBytes,
            warnings: event.warnings,
          });
        },
        onError: (event) => {
          exportHandleRef.current = undefined;
          if (event.message === EXPORT_CANCELLED_MESSAGE) {
            autoExportLog("cancelled");
            setExportState({ status: "idle" });
          } else {
            autoExportLog(`ERROR ${event.message}`);
            setExportState({ status: "error", message: event.message });
          }
        },
      });
    } catch (error) {
      exportHandleRef.current = undefined;
      autoExportLog(`ERROR ${String(error)}`);
      setExportState({ status: "error", message: String(error) });
    }
  }, [period, clips, exportMissingDays, exportMissingDayDurationMs, exportOrientation]);

  const cancelExport = useCallback(() => {
    exportHandleRef.current?.cancel().catch((error) => console.warn("cancelExport failed:", error));
  }, []);

  const optionsLoaded =
    exportShowDate !== undefined &&
    exportShowHour !== undefined &&
    exportShowTitle !== undefined &&
    exportMissingDays !== undefined &&
    exportMissingDayDurationMs !== undefined &&
    exportOrientation !== undefined;

  useDevAutoExport(period !== undefined && clips !== undefined && untrimmed !== undefined && optionsLoaded, startExport);

  if (period === undefined || clips === undefined || !optionsLoaded) {
    return (
      <View style={{ padding: 30, alignItems: "center" }}>
        <MyAppText italic>Analyzing period...</MyAppText>
      </View>
    );
  }

  const renderSize = getRenderSize(exportOrientation);

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
              : estimateFileSizeBytes(montageDurationMs, renderSize, EXPORT_FPS)
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

        {exportState.status === "idle" && (
          <View style={{ gap: 10, marginHorizontal: 10 }}>
            <Pressable onPress={() => Alert.alert("Preview", "The preview render lands in a later phase.")}>
              <ThemedButton
                variant="outline"
                themeColor="primary"
                text="Preview"
                Icon={({ theme }) => <Feather name="play" size={20} color={theme.colors.primary} />}
              />
            </Pressable>
            <Pressable onPress={startExport}>
              <ThemedButton
                themeColor="primary"
                text="Create the video"
                Icon={({ theme }) => <Feather name="film" size={20} color={theme.colors.textOnPrimary} />}
              />
            </Pressable>
          </View>
        )}

        {exportState.status === "exporting" && (
          <ExportingSection progress={exportState.progress} phase={exportState.phase} onCancel={cancelExport} />
        )}

        {exportState.status === "done" && (
          <ExportDoneSection
            outputPath={exportState.outputPath}
            durationMs={exportState.durationMs}
            fileSizeBytes={exportState.fileSizeBytes}
            warnings={exportState.warnings}
            onDeleted={() => setExportState({ status: "idle" })}
          />
        )}

        {exportState.status === "error" && <ExportErrorSection message={exportState.message} onRetry={startExport} />}

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
// Export flow sections (§9.5)

const PHASE_LABELS: Record<ExportPhase, string> = {
  download: "Downloading…",
  chunk: "Rendering…",
  assemble: "Finalizing…",
};

function ProgressBar({ progress }: { progress: number }) {
  const theme = useTheme();
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: theme.colors.border, overflow: "hidden" }}>
      <View
        style={{
          width: `${Math.min(Math.max(progress, 0), 1) * 100}%`,
          height: "100%",
          borderRadius: 4,
          backgroundColor: theme.colors.primary,
        }}
      />
    </View>
  );
}

function ExportingSection({
  progress,
  phase,
  onCancel,
}: {
  progress: number;
  phase: ExportPhase;
  onCancel: () => void;
}) {
  return (
    <OptionSection
      title="Creating the video"
      Icon={({ theme: { colors } }) => <Feather name="loader" size={25} color={colors.text} />}
    >
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <MyAppText size={14}>{PHASE_LABELS[phase]}</MyAppText>
          <MyAppText size={14}>{`${Math.round(progress * 100)}%`}</MyAppText>
        </View>
        <ProgressBar progress={progress} />
        <MyAppText size={12} italic>
          Keep the app open — the export stops if you leave.
        </MyAppText>
      </View>
      <Pressable onPress={onCancel}>
        <ThemedButton
          variant="outline"
          themeColor="primary"
          text="Cancel"
          Icon={({ theme }) => <Feather name="x" size={20} color={theme.colors.primary} />}
        />
      </Pressable>
    </OptionSection>
  );
}

function ExportDoneSection({
  outputPath,
  durationMs,
  fileSizeBytes,
  warnings,
  onDeleted,
}: {
  outputPath: string;
  durationMs: number;
  fileSizeBytes: number;
  warnings: string[];
  onDeleted: () => void;
}) {
  async function saveToPhotos() {
    try {
      await MediaLibrary.saveToLibraryAsync(outputPath);
      Alert.alert("Saved to Photos", "The montage was added to your Photos library.");
    } catch (error) {
      Alert.alert("Save failed", String(error));
    }
  }

  async function share() {
    try {
      await Sharing.shareAsync(outputPath, { mimeType: "video/mp4" });
    } catch (error) {
      Alert.alert("Share failed", String(error));
    }
  }

  function confirmDelete() {
    Alert.alert("Delete this export?", "The video file will be removed.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await FileSystem.deleteAsync(outputPath, { idempotent: true });
            onDeleted();
          } catch (error) {
            Alert.alert("Delete failed", String(error));
          }
        },
      },
    ]);
  }

  return (
    <OptionSection
      title="Montage ready"
      Icon={({ theme: { colors } }) => <Feather name="check-circle" size={25} color={colors.text} />}
    >
      <MyAppText size={16}>{`${formatDurationMs(durationMs)} — ${formatBytes(fileSizeBytes)}`}</MyAppText>

      {warnings.map((warning) => (
        <MyAppText key={warning} italic size={12}>
          {`⚠ ${warning}`}
        </MyAppText>
      ))}

      <Pressable onPress={saveToPhotos}>
        <ThemedButton
          themeColor="primary"
          text="Save to Photos"
          Icon={({ theme }) => <Feather name="download" size={20} color={theme.colors.textOnPrimary} />}
        />
      </Pressable>
      <Pressable onPress={share}>
        <ThemedButton
          variant="outline"
          themeColor="primary"
          text="Share"
          Icon={({ theme }) => <Feather name="share" size={20} color={theme.colors.primary} />}
        />
      </Pressable>
      <Pressable onPress={confirmDelete}>
        <ThemedButton
          variant="outline"
          themeColor="primary"
          text="Delete"
          Icon={({ theme }) => <Feather name="trash-2" size={20} color={theme.colors.primary} />}
        />
      </Pressable>
    </OptionSection>
  );
}

function ExportErrorSection({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <OptionSection
      title="Export failed"
      Icon={({ theme: { colors } }) => <Feather name="alert-triangle" size={25} color={colors.text} />}
    >
      <MyAppText size={13} italic>
        {message}
      </MyAppText>
      <Pressable onPress={onRetry}>
        <ThemedButton
          themeColor="primary"
          text="Retry"
          Icon={({ theme }) => <Feather name="refresh-cw" size={20} color={theme.colors.textOnPrimary} />}
        />
      </Pressable>
    </OptionSection>
  );
}

// ----------------------------------------------------------------------------------------------------
// Full durations of untrimmed clips, fetched from the media library (their whole
// length goes into the montage). Deleted assets are collected as unavailable.

function useUntrimmedDurations(untrimmedClips: SelectVideoMetadata[] | undefined) {
  const [result, setResult] = useState<{ totalMs: number; unavailableIds: string[] }>();

  // Key the effect on the clip ids, not the array identity: `untrimmedClips` is
  // recomputed (new array) on every render because usePeriod rebuilds its periods
  // each render — with the array itself as dependency this effect refetched from
  // MediaLibrary and setResult in an endless loop ("Maximum update depth exceeded").
  const untrimmedIdsKey = untrimmedClips?.map((clip) => clip.videoId).join(",");

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [untrimmedIdsKey]);

  return result;
}
