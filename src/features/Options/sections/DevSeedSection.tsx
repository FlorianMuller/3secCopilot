import Feather from "@expo/vector-icons/Feather";
import * as MediaLibrary from "expo-media-library";
import { useState } from "react";
import { Alert, Pressable } from "react-native";
import { ThemedButton } from "../../../components/ThemedButton";
import {
  changeVideoDate,
  markVideoAsSelected,
  updateVideoTitleAndDescription,
  updateVideoTrimMetadata,
} from "../../../services/metadata";
import { OptionSection } from "../OptionSection";

const DAY_MS = 86_400_000;

// Dev-only harness (simulator testing): selects every video in the library and spreads
// them over recent days (one per day, with gaps) so the Export flow has realistic data —
// trims on most clips, titles/descriptions on some, day gaps to exercise missing-day beats.
export function DevSeedSection() {
  const [status, setStatus] = useState<string>();

  async function seed() {
    const permission = await MediaLibrary.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Seed demo data", "Media library permission is required.");
      return;
    }

    const { assets } = await MediaLibrary.getAssetsAsync({ mediaType: "video", first: 200 });
    if (assets.length === 0) {
      setStatus("No videos in the library — add some first (simctl addmedia).");
      return;
    }

    let dayOffset = 0;
    for (const [index, asset] of assets.entries()) {
      const originalDate = new Date(asset.creationTime);
      // Every 3rd day is left empty to create missing-day beats
      if (dayOffset % 3 === 2) {
        dayOffset += 1;
      }
      const assignedDate = new Date(Date.now() - dayOffset * DAY_MS);
      assignedDate.setHours(12, 0, 0, 0);
      dayOffset += 1;

      await markVideoAsSelected(asset.id, originalDate);
      await changeVideoDate(asset.id, originalDate, assignedDate);

      // Trim 2 clips out of 3, leave the rest full-length (untrimmed warning path)
      if (index % 3 !== 2) {
        const durationMs = asset.duration * 1000;
        const endMs = Math.min(2500, Math.max(500, durationMs));
        await updateVideoTrimMetadata(asset.id, originalDate, 0, endMs);
      }

      if (index % 2 === 0) {
        await updateVideoTitleAndDescription(
          asset.id,
          originalDate,
          `Demo title ${index + 1}`,
          index % 4 === 0 ? `Demo description ${index + 1}` : null
        );
      }
    }

    setStatus(`Seeded ${assets.length} videos over ${dayOffset} days.`);
  }

  return (
    <OptionSection
      title="Seed demo data (dev)"
      description="Select every library video and spread them over recent days with trims, titles and gaps"
      Icon={({ theme: { colors } }) => <Feather name="database" size={25} color={colors.text} />}
    >
      <Pressable
        onPress={() =>
          seed().catch((e) => {
            console.error("Seed demo data error:", e);
            Alert.alert("Seed demo data failed", String(e));
          })
        }
      >
        <ThemedButton
          variant="outline"
          themeColor="primary"
          text={status ?? "Seed demo data"}
          Icon={({ theme }) => <Feather name="zap" size={20} color={theme.colors.primary} />}
        />
      </Pressable>
    </OptionSection>
  );
}
