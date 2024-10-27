import * as FileSystem from "expo-file-system";
import { useEffect, useState } from "react";
import { Pressable } from "react-native";
import { MyAppText } from "../../../components/text/MyAppText";
import { ThemedButton } from "../../../components/ThemedButton";
import { thumbnailCacheDir } from "../../CameraRoll/thumbnailService";
import { OptionSection } from "../OptionSection";
import { formatBytes } from "../../../utils/formatBytes";

export function ThumbnailCacheOptionSection() {
  const [thumbnailCacheDirSize, setThumbnailCacheDirSize] = useState<number>();

  useEffect(() => {
    getThumbnailCacheSize();
  }, []);

  async function getThumbnailCacheSize() {
    try {
      const thumbnailCacheDirInfo = await FileSystem.getInfoAsync(thumbnailCacheDir, { size: true });
      if (!thumbnailCacheDirInfo.exists) {
        setThumbnailCacheDirSize(0);
        return;
      }
      setThumbnailCacheDirSize(thumbnailCacheDirInfo.size);
    } catch (e) {
      console.error("error while retrieving thumbnail cache size:", e);
    }
  }

  async function deleteThumnnailCache() {
    try {
      await FileSystem.deleteAsync(thumbnailCacheDir);
      await getThumbnailCacheSize();
      console.log("thumbnail cache dir deleted");
    } catch (e) {
      console.error("error while deleting thumnail cache dir:", e);
    }
  }

  const sizeTopShow = thumbnailCacheDirSize !== undefined ? formatBytes(thumbnailCacheDirSize) : "...";

  return (
    <OptionSection title="Thumbnail cache" description="Advanced settings about videos thumbnlail cache">
      <MyAppText>The thumbnail cache is taking {sizeTopShow}</MyAppText>

      <Pressable onPress={deleteThumnnailCache}>
        <ThemedButton text="Delete thumbnail cache" />
      </Pressable>
    </OptionSection>
  );
}
