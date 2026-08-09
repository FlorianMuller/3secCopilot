import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@react-navigation/native";
import * as MediaLibrary from "expo-media-library";
import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { getCachedThumbnailUri, getVideoThumbnail } from "../../services/thumbnail";
import { doesFileExists } from "../../utils/fileSytem";

export interface PeriodThumbnailProps {
  videoId: string | null;
  size?: number;
}

// Thumbnail of a period's first selected clip. Reuses the camera roll's thumbnail
// cache; falls back to a placeholder if the asset is gone or generation fails.
export function PeriodThumbnail({ videoId, size = 64 }: PeriodThumbnailProps) {
  const theme = useTheme();
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (videoId === null) {
        return;
      }

      const cachedUri = getCachedThumbnailUri(videoId);
      if (await doesFileExists(cachedUri)) {
        if (!cancelled) {
          setUri(cachedUri);
        }
        return;
      }

      try {
        const info = await MediaLibrary.getAssetInfoAsync(videoId);
        const result = await getVideoThumbnail({ ...info, info });
        if (!cancelled) {
          setUri(result.uri);
        }
      } catch (e) {
        // Asset deleted from the library or thumbnail generation failed — keep the placeholder
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: theme.borderRadius,
        backgroundColor: theme.colors.background,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} resizeMode="cover" />
      ) : (
        <Feather name="film" size={size * 0.4} color={theme.colors.text} />
      )}
    </View>
  );
}
