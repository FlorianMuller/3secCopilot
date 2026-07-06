import Feather from "@expo/vector-icons/Feather";
import * as Sharing from "expo-sharing";
import { useVideoPlayer, VideoView } from "expo-video";
import { DateTime } from "luxon";
import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { SpikeResult } from "../../../../modules/expo-montage/src/ExpoMontage.types";
import ExpoMontage from "../../../../modules/expo-montage/src/ExpoMontageModule";
import { MyAppText } from "../../../components/text/MyAppText";
import { ThemedButton } from "../../../components/ThemedButton";
import { SelectVideoMetadata } from "../../../db/schema";
import { getSelectedVideosMetadataInRange } from "../../../services/metadata";
import { OptionSection } from "../OptionSection";

// Temporary harness for the export feature's phase-1 spike (doc/export-spec.md §10).
// Concatenates the 3 most recent selected clips (with their trims and a date/title
// overlay) through the native AVAssetWriter pipeline. Remove once the real export
// flow ships.

function effectiveDate(metadata: SelectVideoMetadata): Date {
  return metadata.assignedToDate ?? metadata.videoOriginalDate;
}

export function ExportSpikeSection() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<SpikeResult | null>(null);

  const player = useVideoPlayer(result ? result.outputPath : null);

  async function runSpike() {
    try {
      setIsRunning(true);
      setResult(null);

      const metadataList = await getSelectedVideosMetadataInRange(new Date(0), new Date());
      if (metadataList.length === 0) {
        Alert.alert("Export spike", "No selected videos found — select a few videos first.");
        return;
      }

      const clips = metadataList
        .sort((a, b) => effectiveDate(a).getTime() - effectiveDate(b).getTime())
        .slice(-3)
        .map((metadata) => ({
          assetId: metadata.videoId,
          startMs: metadata.trimStartTime,
          endMs: metadata.trimEndTime,
          overlayText: [DateTime.fromJSDate(effectiveDate(metadata)).toFormat("cccc d LLLL"), metadata.title]
            .filter(Boolean)
            .join(" - "),
        }));

      const spikeResult = await ExpoMontage.spikeConcat(clips, {
        width: 1920,
        height: 1080,
        fps: 60,
        videoBitrate: 24_000_000,
      });
      setResult(spikeResult);
    } catch (error) {
      console.error("Export spike error:", error);
      Alert.alert("Export spike failed", String(error));
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <OptionSection
      title="Export spike (dev)"
      description="Concatenate the 3 most recent selected clips through the native montage pipeline"
      Icon={({ theme: { colors } }) => <Feather name="film" size={25} color={colors.text} />}
    >
      <Pressable onPress={runSpike} disabled={isRunning} style={isRunning ? { opacity: 0.6 } : undefined}>
        <ThemedButton
          variant="outline"
          themeColor="primary"
          text={isRunning ? "Rendering..." : "Run export spike"}
          Icon={({ theme }) => <Feather name="play" size={20} color={theme.colors.primary} />}
        />
      </Pressable>

      {result && (
        <View style={{ gap: 10 }}>
          <MyAppText size={14}>
            {`Encoded ${(result.durationMs / 1000).toFixed(1)}s of video in ${(result.encodeMs / 1000).toFixed(1)}s — ${(
              result.fileSizeBytes /
              (1024 * 1024)
            ).toFixed(1)} MB — peak mem ${result.peakMemoryMB.toFixed(0)} MB`}
          </MyAppText>
          {result.warnings.map((warning) => (
            <MyAppText key={warning} italic size={12}>
              {`⚠ ${warning}`}
            </MyAppText>
          ))}

          <VideoView player={player} style={{ width: "100%", aspectRatio: 16 / 9 }} />

          <Pressable onPress={() => Sharing.shareAsync(result.outputPath)}>
            <ThemedButton
              variant="outline"
              themeColor="primary"
              text="Share result"
              Icon={({ theme }) => <Feather name="share" size={20} color={theme.colors.primary} />}
            />
          </Pressable>
        </View>
      )}
    </OptionSection>
  );
}
