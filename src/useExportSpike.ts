// SPIKE — remove before Phase 2.
//
// Temporary, obviously-throwaway trigger for the export-feature Phase 1 de-risking spike
// (see doc/export-spec.md §10, §3 Option B). Proves the native modules/expo-montage module
// (AVFoundation composition + orientation-normalization + aspect-fit scaling + export) works
// end-to-end from JS, against real PHAssets seeded into the simulator's Photos library.
//
// Delete this file and its usage in App.tsx once the spike is verified — none of this is part
// of the real export feature (no UI, no chunking, no overlays, no preferences).
import { useEffect } from "react";
import { Alert } from "react-native";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";

import ExpoMontageModule from "../modules/expo-montage/src/ExpoMontageModule";

export function useExportSpike(): void {
  useEffect(() => {
    if (!__DEV__) {
      return;
    }

    runSpike().catch((error) => {
      console.error("[export-spike] Unhandled error", error);
      Alert.alert("Export spike error", String(error));
    });
  }, []);
}

async function runSpike(): Promise<void> {
  console.log("[export-spike] Requesting media library permission...");
  const permission = await MediaLibrary.requestPermissionsAsync();
  if (permission.status !== "granted") {
    console.warn("[export-spike] Media library permission not granted:", permission.status);
    Alert.alert("Export spike", `Media library permission not granted: ${permission.status}`);
    return;
  }

  const page = await MediaLibrary.getAssetsAsync({
    mediaType: "video",
    sortBy: "creationTime",
    first: 50,
  });
  console.log(`[export-spike] Found ${page.assets.length} video asset(s) in Photos library`);

  if (page.assets.length === 0) {
    Alert.alert("Export spike", "No video assets found in the Photos library — seed the simulator first.");
    return;
  }

  // Assets were seeded in order A, B, C via `xcrun simctl addmedia`; sort ascending by creation
  // time so we concat them back in that same order.
  const assetIds = [...page.assets].sort((a, b) => a.creationTime - b.creationTime).map((asset) => asset.id);
  console.log("[export-spike] Asset ids in order:", assetIds);

  const outputPath = `${FileSystem.documentDirectory}export-spike-output.mp4`;
  console.log("[export-spike] Calling spikeConcat ->", outputPath);

  const startedAt = Date.now();
  const result = await ExpoMontageModule.spikeConcat(assetIds, { width: 1920, height: 1080 }, outputPath);
  const elapsedMs = Date.now() - startedAt;

  console.log("[export-spike] spikeConcat result:", JSON.stringify(result), `(JS-observed ${elapsedMs}ms)`);

  if (result.success) {
    Alert.alert(
      "Export spike: success",
      `Output: ${result.outputPath}\nDuration: ${result.durationMs}ms (native), ${elapsedMs}ms (JS-observed)`
    );
  } else {
    Alert.alert("Export spike: failed", result.error ?? "Unknown error");
  }
}
