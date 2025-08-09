import { useNavigation, useTheme } from "@react-navigation/native";
import { useEffect, useRef } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { CameraRollNavigationProp } from "../../../navigation/CameraRollNavigation";
import { VideoPlayerURI } from "../../../navigation";
import { PhoneMedia } from "../CameraRoll";
import { VidThumbnail } from "../VideoThumbnail";
import { utilStyles } from "../../../utils/utilStyles";

interface VideoThumbnailBarProps {
  videos: PhoneMedia[];
  currentIndex: number;
  routeParams: {
    ids: string[];
    index: number;
    day: string;
  };
}

// const THUMBNAIL_SIZE = 60;
const THUMBNAIL_SIZE = 70;
const THUMBNAIL_MARGIN = 1;
const TOTAL_THUMBNAIL_WIDTH = THUMBNAIL_SIZE + THUMBNAIL_MARGIN * 2;

export function VideoThumbnailBar({ videos, currentIndex, routeParams }: VideoThumbnailBarProps) {
  const navigation = useNavigation<CameraRollNavigationProp>();
  const scrollViewRef = useRef<ScrollView>(null);
  const theme = useTheme();

  useEffect(() => {
    if (scrollViewRef.current && videos.length > 0) {
      const scrollToX = currentIndex * TOTAL_THUMBNAIL_WIDTH - 2.5 * TOTAL_THUMBNAIL_WIDTH;
      scrollViewRef.current.scrollTo({
        x: Math.max(0, scrollToX),
        animated: true,
      });
    }
  }, [currentIndex, videos.length]);

  if (videos.length <= 1) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <ScrollView ref={scrollViewRef} horizontal showsHorizontalScrollIndicator={false}>
        <View style={[utilStyles.ListRow, { gap: THUMBNAIL_MARGIN }, styles.scrollContent]}>
          {videos.map((video, index) => {
            const isActive = index === currentIndex;
            return (
              <VidThumbnail
                key={video.id}
                video={video}
                size={THUMBNAIL_SIZE}
                style={[
                  styles.thumbnailButton,
                  isActive && styles.activeThumbnail,
                  isActive && { borderColor: theme.colors.accent },
                  {
                    borderRadius: theme.borderRadius,
                  },
                ]}
                onPress={() => {
                  console.log("Navigating to video", video.id, "at index", index);
                  navigation.navigate(VideoPlayerURI, { ...routeParams, index });
                }}
              />
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: THUMBNAIL_SIZE + 16,
    paddingVertical: 8,
  },
  scrollView: {},
  scrollContent: {
    paddingHorizontal: 16,
  },
  thumbnailButton: {
    overflow: "hidden",
  },
  activeThumbnail: {
    borderWidth: 2,
  },
});
