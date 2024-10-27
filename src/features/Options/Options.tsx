import { View, Text, Pressable } from "react-native";
import { MyAppText } from "../../components/text/MyAppText";
import { ThemedButton } from "../../components/ThemedButton";
import * as FileSystem from "expo-file-system";
import { thumbnailCacheDir } from "../CameraRoll/thumbnailService";
import { OptionSection } from "./OptionSection";
import { useState } from "react";
import { ThumbnailCacheOptionSection } from "./sections/ThumbnailCacheOptionSection";

export function Options() {
  const [thu] = useState<number>();
  async function getThumbnailCacheSize() {
    const thumbnailCacheDirInfo = FileSystem.getInfoAsync(thumbnailCacheDir, { size: true });
  }

  return (
    <View style={{ paddingTop: 30 }}>
      <ThumbnailCacheOptionSection />
    </View>
  );
}
