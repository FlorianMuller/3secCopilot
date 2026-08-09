import Feather from "@expo/vector-icons/Feather";
import DateTimePicker from "@react-native-community/datetimepicker";
import { RouteProp, useRoute, useTheme } from "@react-navigation/native";
import * as FileSystem from "expo-file-system";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { useVideoPlayer, VideoView } from "expo-video";
import { DateTime } from "luxon";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Switch, View } from "react-native";
import { ClipAnalysis, ExportPhase } from "../../../modules/expo-montage/src/ExpoMontage.types";
import ExpoMontage from "../../../modules/expo-montage/src/ExpoMontageModule";
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
  buildPreviewClips,
  computeMontageDurationMs,
  computeQualityCombos,
  estimateFileSizeBytes,
  EXPORT_CANCELLED_MESSAGE,
  getRenderSize,
  groupClipsForPeriod,
  MontageExportHandle,
  PeriodClips,
  QualityCombo,
  slicePeriodClips,
  startMontageExport,
  startMontagePreview,
  summarizeExportWarnings,
} from "../../services/montage";
import { writeExportDiagnostics } from "../../services/exportDebug";
import preferences, { ExportOrientation } from "../../services/preferences";
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

// Preview flow (§9.4): idle → rendering → ready | error; invalidated back to idle
// whenever an output-affecting option changes
type PreviewFlowState =
  | { status: "idle" }
  | { status: "rendering"; progress: number }
  | { status: "ready"; outputPath: string }
  | { status: "error"; message: string };

// Dev automation hook (simulator testing): EXPO_PUBLIC_AUTO_EXPORT=1 auto-starts the
// export once the stats are loaded and logs progress lines a headless test can follow.
function autoExportLog(line: string) {
  if (__DEV__ && process.env.EXPO_PUBLIC_AUTO_EXPORT) {
    console.log(`[autoexport] ${line}`);
  }
}

// EXPO_PUBLIC_AUTO_PREVIEW=1: auto-triggers the preview render on screen open and
// logs its progress the same way (incl. a final DONE path=… durationMs=… line).
function autoPreviewLog(line: string) {
  if (__DEV__ && process.env.EXPO_PUBLIC_AUTO_PREVIEW) {
    console.log(`[autopreview] ${line}`);
  }
}

function useDevAutoPreview(statsReady: boolean, startPreview: () => void) {
  const hasStarted = useRef(false);

  useEffect(() => {
    if (__DEV__ && process.env.EXPO_PUBLIC_AUTO_PREVIEW && statsReady && !hasStarted.current) {
      hasStarted.current = true;
      autoPreviewLog("starting preview");
      startPreview();
    }
  }, [statsReady, startPreview]);
}

// EXPO_PUBLIC_AUTO_CANCEL_MS=<n>: when auto-export is running, exercise the cancel
// path n ms after the export starts (logs CANCELLED when the cancellation resolves).
function useDevAutoExport(statsReady: boolean, startExport: () => void, cancelExport: () => void) {
  const hasStarted = useRef(false);

  useEffect(() => {
    if (__DEV__ && process.env.EXPO_PUBLIC_AUTO_EXPORT && statsReady && !hasStarted.current) {
      hasStarted.current = true;
      autoExportLog("starting export");
      startExport();
      const autoCancelMs = Number(process.env.EXPO_PUBLIC_AUTO_CANCEL_MS);
      if (autoCancelMs > 0) {
        autoExportLog(`auto-cancel scheduled in ${autoCancelMs}ms`);
        setTimeout(() => {
          autoExportLog("auto-cancelling");
          cancelExport();
        }, autoCancelMs);
      }
    }
  }, [statsReady, startExport, cancelExport]);
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
  // Overlay date/hour wording follows the app language pref (Settings tab); refetched
  // on focus so a change made in Settings applies without reopening the app
  const { appLanguage } = preferences.useAppLanguagePreference({ refetchOnFocus: true });

  // Dev A/V-sync debugging (doc/export-device-checklist.md L91): when the pref is on in
  // a dev build, the Export screen writes a `.debug.jsonl` sidecar and can limit the
  // export to a date window for fast iteration.
  const { exportDebug } = preferences.useExportDebugPreference();
  // EXPO_PUBLIC_EXPORT_DEBUG=1 forces it on for headless sim runs (no UI toggle needed)
  const debugEnabled = __DEV__ && (exportDebug === true || !!process.env.EXPO_PUBLIC_EXPORT_DEBUG);
  const [debugRangeOn, setDebugRangeOn] = useState(false);
  const [debugFrom, setDebugFrom] = useState<Date | undefined>();
  const [debugTo, setDebugTo] = useState<Date | undefined>();

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

  // Render-target quality (§4.1): fresh analyzeClips each screen open, default =
  // mode combo, session-local override only (deliberately not persisted)
  const analyses = useClipAnalyses(clips);
  const qualityInfo = useMemo(() => (analyses === undefined ? undefined : computeQualityCombos(analyses)), [analyses]);
  const [qualityOverride, setQualityOverride] = useState<QualityCombo>();
  const quality = qualityOverride ?? qualityInfo?.defaultCombo;

  useEffect(() => {
    if (analyses !== undefined && qualityInfo !== undefined) {
      const line = `analyze clips=${analyses.length} combos=${qualityInfo.combos
        .map((combo) => `${combo.label}x${combo.clipCount}`)
        .join(" ")} default=${qualityInfo.defaultCombo.label}`;
      autoExportLog(line);
      autoPreviewLog(line);
    }
  }, [analyses, qualityInfo]);

  // EXPO_PUBLIC_AUTO_QUALITY=<label>: session-local quality override for headless
  // runs (there is no tap tooling to drive the picker on the simulator)
  const autoQualityLabel = __DEV__ ? process.env.EXPO_PUBLIC_AUTO_QUALITY : undefined;
  useEffect(() => {
    if (autoQualityLabel && qualityInfo !== undefined) {
      const combo = qualityInfo.combos.find((c) => c.label === autoQualityLabel);
      autoExportLog(
        combo !== undefined
          ? `quality override ${autoQualityLabel}`
          : `quality override ${autoQualityLabel} NOT PRESENT (combos=${qualityInfo.combos.map((c) => c.label).join(",")})`
      );
      if (combo !== undefined) {
        setQualityOverride(combo);
      }
    }
  }, [autoQualityLabel, qualityInfo]);
  const autoQualityPending = autoQualityLabel !== undefined && autoQualityLabel !== "" && qualityOverride === undefined;

  const [exportState, setExportState] = useState<ExportFlowState>({ status: "idle" });
  const exportHandleRef = useRef<MontageExportHandle | undefined>(undefined);

  const [previewState, setPreviewState] = useState<PreviewFlowState>({ status: "idle" });
  const previewStateRef = useRef(previewState);
  previewStateRef.current = previewState;
  const previewHandleRef = useRef<MontageExportHandle | undefined>(undefined);

  // Detach the event listeners if the screen unmounts mid-export (the native task
  // keeps running; without a UI it is simply not observed anymore). A preview render
  // is different: it only exists for this screen, so it is cancelled outright (§9.4).
  useEffect(
    () => () => {
      exportHandleRef.current?.removeListeners();
      const previewHandle = previewHandleRef.current;
      if (previewHandle !== undefined) {
        previewHandle.removeListeners();
        previewHandle.cancel().catch((error) => console.warn("preview cancel failed:", error));
      }
    },
    []
  );

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
      quality === undefined ||
      exportShowDate === undefined ||
      exportShowHour === undefined ||
      exportShowTitle === undefined ||
      exportMissingDays === undefined ||
      exportMissingDayDurationMs === undefined ||
      exportOrientation === undefined ||
      appLanguage === undefined ||
      exportHandleRef.current !== undefined ||
      // Preview and export share the native one-at-a-time slot
      previewHandleRef.current !== undefined
    ) {
      return;
    }
    setExportState({ status: "exporting", progress: 0, phase: "download" });
    try {
      // Debug: optionally restrict the timeline to a date window for fast iteration
      const effectiveClips =
        debugEnabled && debugRangeOn && debugFrom !== undefined && debugTo !== undefined
          ? slicePeriodClips(clips, debugFrom, debugTo)
          : clips;
      const montageClips = buildMontageClips(effectiveClips, {
        periodLabel: period.label,
        showMissingDays: exportMissingDays === "show",
        missingDayDurationMs: exportMissingDayDurationMs,
        showDate: exportShowDate,
        showHour: exportShowHour,
        showTitle: exportShowTitle,
        language: appLanguage,
      });
      autoExportLog(`quality=${quality.label}`);
      exportHandleRef.current = await startMontageExport(
        period.id,
        montageClips,
        exportOrientation,
        quality,
        {
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
            if (debugEnabled) {
              writeExportDiagnostics(montageClips, event, {
                periodLabel: period.label,
                renderSize: getRenderSize(exportOrientation, quality),
                fps: quality.fps,
                mode: "full",
                quality: quality.label,
              }).then((path) => {
                if (path !== undefined) {
                  autoExportLog(`debug sidecar=${path}`);
                  console.log(`[exportDebug] wrote ${path}`);
                }
              });
            }
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
            autoExportLog("CANCELLED");
            setExportState({ status: "idle" });
          } else {
            autoExportLog(`ERROR ${event.message}`);
            setExportState({ status: "error", message: event.message });
          }
        },
        },
        debugEnabled
      );
    } catch (error) {
      exportHandleRef.current = undefined;
      autoExportLog(`ERROR ${String(error)}`);
      setExportState({ status: "error", message: String(error) });
    }
  }, [
    period,
    clips,
    quality,
    exportShowDate,
    exportShowHour,
    exportShowTitle,
    exportMissingDays,
    exportMissingDayDurationMs,
    exportOrientation,
    appLanguage,
    debugEnabled,
    debugRangeOn,
    debugFrom,
    debugTo,
  ]);

  const cancelExport = useCallback(() => {
    exportHandleRef.current?.cancel().catch((error) => console.warn("cancelExport failed:", error));
  }, []);

  // ---------------------------------------------------------------------------------
  // Preview (§9.4)

  // Discard whatever the preview flow holds: cancel a running render, drop the
  // cached file of a ready one, back to idle.
  const discardPreview = useCallback(() => {
    const handle = previewHandleRef.current;
    if (handle !== undefined) {
      previewHandleRef.current = undefined;
      handle.removeListeners();
      handle.cancel().catch((error) => console.warn("preview cancel failed:", error));
    }
    const state = previewStateRef.current;
    if (state.status === "ready") {
      FileSystem.deleteAsync(state.outputPath, { idempotent: true }).catch(() => {});
    }
    if (state.status !== "idle") {
      setPreviewState({ status: "idle" });
    }
  }, []);

  const startPreview = useCallback(async () => {
    if (
      period === undefined ||
      clips === undefined ||
      quality === undefined ||
      exportShowDate === undefined ||
      exportShowHour === undefined ||
      exportShowTitle === undefined ||
      exportMissingDays === undefined ||
      exportMissingDayDurationMs === undefined ||
      exportOrientation === undefined ||
      appLanguage === undefined ||
      previewHandleRef.current !== undefined ||
      exportHandleRef.current !== undefined
    ) {
      return;
    }
    discardPreview();
    setPreviewState({ status: "rendering", progress: 0 });
    try {
      const previewClips = buildPreviewClips(clips, {
        periodLabel: period.label,
        showMissingDays: exportMissingDays === "show",
        missingDayDurationMs: exportMissingDayDurationMs,
        showDate: exportShowDate,
        showHour: exportShowHour,
        showTitle: exportShowTitle,
        language: appLanguage,
      });
      autoPreviewLog(
        `clips=${previewClips.length} (videos=${previewClips.filter((c) => c.type === "video").length} beats=${
          previewClips.filter((c) => c.type === "missingDay").length
        }) quality=${quality.label}`
      );
      previewHandleRef.current = await startMontagePreview(previewClips, exportOrientation, quality, {
        onProgress: (event) => {
          autoPreviewLog(`phase=${event.phase} progress=${event.progress.toFixed(3)}`);
          setPreviewState({ status: "rendering", progress: event.progress });
        },
        onComplete: (event) => {
          previewHandleRef.current = undefined;
          autoPreviewLog(
            `DONE path=${event.outputPath} durationMs=${Math.round(event.durationMs)} sizeBytes=${
              event.fileSizeBytes
            } peakMB=${Math.round(event.peakMemoryMB)}`
          );
          setPreviewState({ status: "ready", outputPath: event.outputPath });
        },
        onError: (event) => {
          previewHandleRef.current = undefined;
          if (event.message === EXPORT_CANCELLED_MESSAGE) {
            autoPreviewLog("CANCELLED");
            setPreviewState({ status: "idle" });
          } else {
            autoPreviewLog(`ERROR ${event.message}`);
            setPreviewState({ status: "error", message: event.message });
          }
        },
      });
    } catch (error) {
      previewHandleRef.current = undefined;
      autoPreviewLog(`ERROR ${String(error)}`);
      setPreviewState({ status: "error", message: String(error) });
    }
  }, [
    period,
    clips,
    quality,
    exportShowDate,
    exportShowHour,
    exportShowTitle,
    exportMissingDays,
    exportMissingDayDurationMs,
    exportOrientation,
    appLanguage,
    discardPreview,
  ]);

  // §9.4: invalidate the cached preview whenever an output-affecting option changes
  // (overlay toggles, missing days & beat duration, orientation, quality pick)
  const previewOptionsKey = [
    exportShowDate,
    exportShowHour,
    exportShowTitle,
    exportMissingDays,
    exportMissingDayDurationMs,
    exportOrientation,
    appLanguage,
    quality?.label,
  ].join("|");
  const previousPreviewOptionsKey = useRef(previewOptionsKey);
  useEffect(() => {
    if (previousPreviewOptionsKey.current !== previewOptionsKey) {
      previousPreviewOptionsKey.current = previewOptionsKey;
      discardPreview();
    }
  }, [previewOptionsKey, discardPreview]);

  const optionsLoaded =
    exportShowDate !== undefined &&
    exportShowHour !== undefined &&
    exportShowTitle !== undefined &&
    exportMissingDays !== undefined &&
    exportMissingDayDurationMs !== undefined &&
    exportOrientation !== undefined &&
    appLanguage !== undefined;

  const statsReady =
    period !== undefined &&
    clips !== undefined &&
    untrimmed !== undefined &&
    quality !== undefined &&
    !autoQualityPending &&
    optionsLoaded;

  useDevAutoExport(statsReady, startExport, cancelExport);
  useDevAutoPreview(statsReady, startPreview);

  if (period === undefined || clips === undefined || !optionsLoaded) {
    return (
      <View style={{ padding: 30, alignItems: "center" }}>
        <MyAppText italic>Analyzing period...</MyAppText>
      </View>
    );
  }

  // §9.2 loading state: quality-dependent stats show "..." until analyzeClips resolves
  const renderSize = quality === undefined ? undefined : getRenderSize(exportOrientation, quality);

  const montageDurationMs =
    untrimmed === undefined
      ? undefined
      : computeMontageDurationMs(clips, untrimmed.totalMs, {
          showMissingDays: exportMissingDays === "show",
          missingDayDurationMs: exportMissingDayDurationMs,
        });

  const previewRendering = previewState.status === "rendering";

  return (
    <ScrollView style={{ paddingTop: 15 }}>
      <View style={{ gap: 20 }}>
        <StatsSection
          clips={clips}
          montageDurationMs={montageDurationMs}
          estimatedSizeBytes={
            // §4.2: recomputed live as options change (beats, duration pref, quality pick)
            montageDurationMs === undefined || renderSize === undefined || quality === undefined
              ? undefined
              : estimateFileSizeBytes(montageDurationMs, renderSize, quality.fps)
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

          <OptionLine label="Quality">
            {qualityInfo === undefined || quality === undefined ? (
              <MyAppText size={14} italic>
                Analyzing...
              </MyAppText>
            ) : (
              // §4.1: only the combos actually present in this period's clips;
              // the pick is session-local, never persisted
              <SegmentedControl
                size={14}
                options={qualityInfo.combos.map((combo) => ({ label: combo.label, value: combo.label }))}
                selectedValue={quality.label}
                onValueChange={(label) =>
                  setQualityOverride(qualityInfo.combos.find((combo) => combo.label === label))
                }
              />
            )}
          </OptionLine>
        </OptionSection>

        {debugEnabled && (
          <OptionSection
            title="Debug (A/V sync)"
            Icon={({ theme: { colors } }) => <Feather name="terminal" size={25} color={colors.text} />}
          >
            <MyAppText size={12} italic style={{ paddingHorizontal: 10, paddingBottom: 6 }}>
              Writes a .debug.jsonl next to the video (per-clip / per-chunk / assembled A/V
              measurements). Optionally limit the export to a date window for fast iteration.
            </MyAppText>
            <BooleanOptionLine label="Limit to date range" value={debugRangeOn} onChange={setDebugRangeOn} />
            {debugRangeOn && clips.days.length > 0 && (
              <>
                <OptionLine label="From">
                  <DateTimePicker
                    value={debugFrom ?? clips.days[0]}
                    mode="date"
                    display="default"
                    minimumDate={clips.days[0]}
                    maximumDate={clips.days[clips.days.length - 1]}
                    onChange={(_, selected) => selected && setDebugFrom(selected)}
                  />
                </OptionLine>
                <OptionLine label="To">
                  <DateTimePicker
                    value={debugTo ?? clips.days[clips.days.length - 1]}
                    mode="date"
                    display="default"
                    minimumDate={clips.days[0]}
                    maximumDate={clips.days[clips.days.length - 1]}
                    onChange={(_, selected) => selected && setDebugTo(selected)}
                  />
                </OptionLine>
              </>
            )}
          </OptionSection>
        )}

        {exportState.status === "idle" && (
          <View style={{ gap: 10, marginHorizontal: 10 }}>
            {!previewRendering && (
              <Pressable onPress={startPreview} disabled={quality === undefined}>
                <ThemedButton
                  variant="outline"
                  themeColor="primary"
                  text={previewState.status === "ready" ? "Preview again" : "Preview"}
                  Icon={({ theme }) => <Feather name="play" size={20} color={theme.colors.primary} />}
                />
              </Pressable>
            )}
            <Pressable onPress={startExport} disabled={quality === undefined || previewRendering}>
              <ThemedButton
                themeColor="primary"
                text="Create the video"
                Icon={({ theme }) => <Feather name="film" size={20} color={theme.colors.textOnPrimary} />}
              />
            </Pressable>
          </View>
        )}

        {previewState.status === "rendering" && (
          <PreviewRenderingSection progress={previewState.progress} onCancel={discardPreview} />
        )}

        {previewState.status === "ready" && quality !== undefined && (
          <PreviewReadySection
            outputPath={previewState.outputPath}
            orientation={exportOrientation}
            finalQualityLabel={quality.label}
          />
        )}

        {previewState.status === "error" && (
          <OptionSection
            title="Preview failed"
            Icon={({ theme: { colors } }) => <Feather name="alert-triangle" size={25} color={colors.text} />}
          >
            <MyAppText size={13} italic>
              {previewState.message}
            </MyAppText>
          </OptionSection>
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

// ----------------------------------------------------------------------------------------------------
// Preview sections (§9.4)

function PreviewRenderingSection({ progress, onCancel }: { progress: number; onCancel: () => void }) {
  return (
    <OptionSection
      title="Rendering preview"
      Icon={({ theme: { colors } }) => <Feather name="loader" size={25} color={colors.text} />}
    >
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <MyAppText size={14}>Rendering…</MyAppText>
          <MyAppText size={14}>{`${Math.round(progress * 100)}%`}</MyAppText>
        </View>
        <ProgressBar progress={progress} />
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

function PreviewReadySection({
  outputPath,
  orientation,
  finalQualityLabel,
}: {
  outputPath: string;
  orientation: ExportOrientation;
  finalQualityLabel: string;
}) {
  const player = useVideoPlayer(outputPath, (p) => {
    p.loop = true;
    p.play();
  });
  const isPortrait = orientation === "portrait";

  return (
    <OptionSection
      title="Preview"
      Icon={({ theme: { colors } }) => <Feather name="play" size={25} color={colors.text} />}
    >
      <VideoView
        player={player}
        style={{
          alignSelf: "center",
          width: isPortrait ? "55%" : "100%",
          aspectRatio: isPortrait ? 9 / 16 : 16 / 9,
          borderRadius: 8,
          overflow: "hidden",
        }}
        contentFit="contain"
        nativeControls
      />
      <MyAppText size={12} italic>
        {`Low-resolution draft of the first days — the final video renders at ${finalQualityLabel}.`}
      </MyAppText>
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

      {summarizeExportWarnings(warnings).map((warning) => (
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
// analyzeClips over the period's selected clips (§4.1): metadata-only native scan
// backing the quality picker. Runs fresh on every screen open (the hook state dies
// with the screen); unresolvable assets are simply missing from the result.

function useClipAnalyses(clips: PeriodClips | undefined) {
  const [analyses, setAnalyses] = useState<ClipAnalysis[]>();

  // Key on the joined ids: `clips` is a new object every render (usePeriod rebuilds
  // its periods each render — same lesson as useUntrimmedDurations below)
  const idsKey = useMemo(() => {
    if (clips === undefined) {
      return undefined;
    }
    return clips.days
      .map((day) => clips.clipByDay.get(day.toDateString())?.videoId)
      .filter((id): id is string => id !== undefined)
      .join("\n");
  }, [clips]);

  useEffect(() => {
    if (idsKey === undefined) {
      return;
    }
    let cancelled = false;
    const assetIds = idsKey.length > 0 ? idsKey.split("\n") : [];
    ExpoMontage.analyzeClips(assetIds)
      .then((result) => {
        if (!cancelled) {
          setAnalyses(result);
        }
      })
      .catch((error) => {
        // Fall back to the 1080p30 default instead of blocking the screen forever
        console.warn("analyzeClips failed:", error);
        if (!cancelled) {
          setAnalyses([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  return analyses;
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
