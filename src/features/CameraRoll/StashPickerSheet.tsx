import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useTheme } from "@react-navigation/native";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import * as ContextMenu from "zeego/context-menu";
import { MyAppText } from "../../components/text/MyAppText";
import { SubTitle } from "../../components/text/SubTitle";
import { ThemedButton } from "../../components/ThemedButton";
import { removeVideoFromStash } from "../../services/metadata";
import { getStashVideos } from "../../services/stash";
import { displayDate } from "../../utils/dateTime";
import { utilStyles } from "../../utils/utilStyles";
import { PhoneMedia } from "./CameraRoll";
import { VidThumbnail } from "./VideoThumbnail";

interface StashPickerSheetProps {
  day: Date;
  onPick: (video: PhoneMedia) => void;
  // Called after a video has been taken out of the stash from here, with its refreshed metadata, so the
  // camera roll can show it again.
  onRemove?: (video: PhoneMedia) => void;
}

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "loaded"; videos: PhoneMedia[] };

// Bottom-sheet content listing the cheat stash as a flat newest-first grid. Tapping a thumbnail picks
// that video to fill `day`. Rendered inside the shared DynamicBottomSheet.
export function StashPickerSheet({ day, onPick, onRemove }: StashPickerSheetProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const thumbnailSize = width / 5;
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const loadStash = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const videos = await getStashVideos();
      setState({ status: "loaded", videos });
    } catch (error) {
      console.error("Failed to load cheat stash videos", error);
      setState({ status: "error" });
    }
  }, []);

  useEffect(() => {
    loadStash();
  }, [loadStash]);

  const handleRemove = async (video: PhoneMedia) => {
    try {
      const metadata = await removeVideoFromStash(video.id);
      // Drop it from the grid right away.
      setState((prev) =>
        prev.status === "loaded"
          ? { status: "loaded", videos: prev.videos.filter((v) => v.id !== video.id) }
          : prev
      );
      if (metadata) {
        onRemove?.({ ...video, metadata });
      }
    } catch (error) {
      console.error("Failed to remove video from cheat stash", error);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <SubTitle>Cheat stash</SubTitle>
        <MyAppText size={14} color={theme.colors.text}>
          Fill {displayDate(day)}
        </MyAppText>
      </View>

      {state.status === "loading" && (
        <View style={[utilStyles.centerVertical, styles.statusArea]}>
          <ActivityIndicator color={theme.colors.text} />
        </View>
      )}

      {state.status === "error" && (
        <View style={[utilStyles.centerVertical, styles.statusArea]}>
          <MyAppText size={14}>Couldn't load your cheat stash</MyAppText>
          <Pressable onPress={loadStash} hitSlop={8}>
            <ThemedButton text="Try again" variant="outline" size={16} style={styles.retryButton} />
          </Pressable>
        </View>
      )}

      {state.status === "loaded" && state.videos.length === 0 && (
        <View style={[utilStyles.centerVertical, styles.statusArea]}>
          <MyAppText size={14}>No videos in your cheat stash yet</MyAppText>
        </View>
      )}

      {state.status === "loaded" && state.videos.length > 0 && (
        <BottomSheetScrollView contentContainerStyle={styles.grid}>
          {state.videos.map((video) => (
            <ContextMenu.Root key={video.id}>
              <ContextMenu.Trigger>
                <View style={{ padding: 1, width: thumbnailSize, height: thumbnailSize }}>
                  <VidThumbnail video={video} onPress={() => onPick(video)} onLongPress={() => {}} />
                </View>
              </ContextMenu.Trigger>
              <ContextMenu.Content>
                <ContextMenu.Item key="remove" onSelect={() => handleRemove(video)} destructive>
                  <ContextMenu.ItemTitle>Remove from cheat stash</ContextMenu.ItemTitle>
                  <ContextMenu.ItemIcon ios={{ name: "archivebox" }} />
                </ContextMenu.Item>
              </ContextMenu.Content>
            </ContextMenu.Root>
          ))}
        </BottomSheetScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignSelf: "stretch",
  },
  header: {
    alignItems: "center",
    gap: 4,
    marginBottom: 12,
  },
  statusArea: {
    flex: 1,
    paddingVertical: 40,
    gap: 16,
  },
  retryButton: {
    width: 160,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    paddingHorizontal: 4,
  },
});
