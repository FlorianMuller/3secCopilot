import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useNavigation, useTheme } from "@react-navigation/native";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, TextInput, useWindowDimensions, View } from "react-native";
import * as DropdownMenu from "zeego/dropdown-menu";
import { MyAppText } from "../../components/text/MyAppText";
import { SubTitle } from "../../components/text/SubTitle";
import { ThemedButton } from "../../components/ThemedButton";
import { VideoMetadata } from "../../db/schema";
import { VideoPlayerURI } from "../../navigation";
import { CameraRollNavigationProp } from "../../navigation/CameraRollNavigation";
import { isLivePhoto } from "../../services/mediaLibrary";
import { displayDate } from "../../utils/dateTime";
import { PhoneMedia } from "./CameraRoll";
import { VideoActionMenu } from "./VideoActionMenu";
import { VidThumbnail } from "./VideoThumbnail";

interface DaySectionProps {
  item: {
    day: Date;
    videosOfTheDay: PhoneMedia[];
    isVisible: boolean;
    note?: string;
    // True while the day's videos are still being fetched lazily (the "unselected only" filter), so we
    // show a spinner instead of prematurely flashing the "no videos" empty state.
    isLoading: boolean;
  };
  onMetadataUpdate?: (videoId: string, metadata: VideoMetadata) => void;
  onDayNoteChange?: (day: Date, note: string | null) => void;
}

function showVideoByDefault(video: PhoneMedia) {
  return !isLivePhoto(video) || video.metadata?.isSelected;
}

export const DaySection = React.memo(function DaySection({
  item: { day, videosOfTheDay, isVisible, note, isLoading },
  onMetadataUpdate,
  onDayNoteChange,
}: DaySectionProps) {
  const theme = useTheme();
  const navigation = useNavigation<CameraRollNavigationProp>();
  const [showLivePhotos, setShowLivePhotos] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  // Optimistic note value shown right after committing, until the parent's
  // async DB save propagates the new `note` prop back (avoids a flash of the
  // previous note while the save is in flight). `undefined` = follow the prop.
  const [pendingNote, setPendingNote] = useState<string | null | undefined>(undefined);

  const effectiveNote = pendingNote !== undefined ? pendingNote : note ?? null;

  // Drop the optimistic value once the prop catches up to it.
  useEffect(() => {
    if (pendingNote !== undefined && (note ?? null) === pendingNote) {
      setPendingNote(undefined);
    }
  }, [note, pendingNote]);

  const dimmedColor = theme.colors.text.startsWith("rgb(")
    ? theme.colors.text.replace("rgb(", "rgba(").replace(")", ", 0.5)")
    : theme.colors.text + "80";

  const startEditingNote = () => {
    setNoteDraft(effectiveNote ?? "");
    setIsEditingNote(true);
  };

  const commitNote = () => {
    setIsEditingNote(false);
    const trimmed = noteDraft.trim();
    const newNote = trimmed ? trimmed : null;
    setPendingNote(newNote);
    onDayNoteChange?.(day, newNote);
  };

  const { width } = useWindowDimensions();
  const thumbnailSize = width / 5;

  const defaultVideos = videosOfTheDay.filter(showVideoByDefault);
  const hasDefaultVideos = defaultVideos.length > 0;
  const hasLivePhotos = videosOfTheDay.some((v) => !showVideoByDefault(v));

  // Filter videos: show live photos by default if no regular videos, otherwise respect toggle
  const displayedVideos = showLivePhotos || !hasDefaultVideos ? videosOfTheDay : defaultVideos;

  // Reorder videos
  const reversedVideosOfTheDay = [...displayedVideos].reverse();
  const videosIds = reversedVideosOfTheDay.map((vid) => vid.id);

  const dayHasAVideoSelected = videosOfTheDay.some((v) => v.metadata?.isSelected);
  const showToggleButton = hasDefaultVideos && hasLivePhotos;

  const hasVideos = videosOfTheDay.length > 0;
  // The note is a reminder for days still missing a selected video, so it
  // disappears once one is picked (but stays in the DB).
  const showNote = !!effectiveNote && !dayHasAVideoSelected;
  const showAddNoteButton = !effectiveNote && !hasVideos && !isEditingNote;
  const showAddNoteMenu = !effectiveNote && hasVideos && !isEditingNote && !dayHasAVideoSelected;

  return (
    <View style={styles.dateSection} key={day.getTime()}>
      <View style={styles.title}>
        {!dayHasAVideoSelected && <Feather name="circle" size={15} color="white" />}
        {dayHasAVideoSelected && <Feather name="check-circle" size={15} color="white" />}
        <SubTitle>{displayDate(day)}</SubTitle>

        <View style={styles.titleActions}>
          {/* Live Photos Toggle Button */}
          {showToggleButton && (
            <Pressable onPress={() => setShowLivePhotos(!showLivePhotos)}>
              <ThemedButton
                Icon={({ iconProps }) => (
                  <MaterialCommunityIcons
                    name={showLivePhotos ? "image-outline" : "image-off-outline"}
                    {...iconProps}
                  />
                )}
                text="Live"
                size={14}
                variant={showLivePhotos ? "filled" : "outline"}
                themeColor={showLivePhotos ? "primary" : "secondary"}
              />
            </Pressable>
          )}

          {/* Add note menu (when the day has videos but no note yet) */}
          {showAddNoteMenu && (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                <MaterialCommunityIcons name="dots-vertical" size={20} color={theme.colors.primary} />
              </DropdownMenu.Trigger>
              <DropdownMenu.Content>
                <DropdownMenu.Item key="add-note" onSelect={startEditingNote}>
                  <DropdownMenu.ItemTitle>Add note</DropdownMenu.ItemTitle>
                  <DropdownMenu.ItemIcon ios={{ name: "note.text" }} />
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          )}
        </View>
      </View>

      <View style={styles.thumbnailList}>
        {/* Video list */}
        {videosOfTheDay.length > 0 &&
          reversedVideosOfTheDay.map((vid, i) => (
            <View key={vid.id} style={{ padding: 1, width: thumbnailSize, height: thumbnailSize }}>
              <VideoActionMenu video={vid} onMetadataUpdate={onMetadataUpdate}>
                <VidThumbnail
                  video={vid}
                  displayAs={dayHasAVideoSelected ? (vid.metadata?.isSelected ? "normal" : "unselected") : "normal"}
                  onPress={() => {
                    navigation.navigate(VideoPlayerURI, { day: day.toISOString(), ids: videosIds, index: i });
                  }}
                  /**
                   * Defining `onLongPress` to avoid accidental firing of button
                   * see: https://github.com/nandorojo/zeego/issues/145
                   */
                  onLongPress={() => {}}
                  style={vid.metadata?.isSelected && { borderWidth: 2, borderColor: theme.colors.accent }}
                  isVisible={isVisible}
                />
              </VideoActionMenu>
            </View>
          ))}

        {/* Videos still loading (lazy fetch for the "unselected only" filter) */}
        {videosOfTheDay.length === 0 && isLoading && (
          <View style={[styles.center, { height: 100 }]}>
            <ActivityIndicator color={theme.colors.text} />
          </View>
        )}

        {/* No video */}
        {videosOfTheDay.length === 0 && !isLoading && (
          <View style={[styles.center, { height: 100 }]}>
            <MyAppText>❌ No videos</MyAppText>
          </View>
        )}
      </View>

      {/* Day note: inline editor / dimmed display / add-note affordance */}
      {isEditingNote && (
        <TextInput
          style={[styles.noteInput, { color: dimmedColor }]}
          value={noteDraft}
          onChangeText={setNoteDraft}
          onBlur={commitNote}
          autoFocus
          multiline
          placeholder="Add a note…"
          placeholderTextColor={dimmedColor}
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          onSubmitEditing={commitNote}
        />
      )}

      {!isEditingNote && showNote && (
        <Pressable onPress={startEditingNote} style={styles.noteContainer}>
          <MyAppText color={dimmedColor} size={14} italic>
            {effectiveNote}
          </MyAppText>
        </Pressable>
      )}

      {showAddNoteButton && (
        <Pressable onPress={startEditingNote} style={styles.noteContainer} hitSlop={8}>
          <MyAppText color={dimmedColor} size={14} italic>
            + add note
          </MyAppText>
        </Pressable>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  dateSection: {
    marginBottom: 40,
  },
  title: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginBottom: 10,
  },
  titleActions: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  noteContainer: {
    alignSelf: "center",
    alignItems: "center",
    marginTop: 6,
    paddingVertical: 3,
    maxWidth: "85%",
  },
  noteInput: {
    alignSelf: "stretch",
    marginTop: 6,
    fontSize: 14,
    textAlign: "center",
    fontStyle: "italic",
  },
  thumbnailList: {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
  },
  center: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
});
