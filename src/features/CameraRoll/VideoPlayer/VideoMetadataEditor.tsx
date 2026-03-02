import BottomSheet, { BottomSheetBackdrop, BottomSheetTextInput, BottomSheetView } from "@gorhom/bottom-sheet";
import { useTheme } from "@react-navigation/native";
import React, { forwardRef, useCallback, useEffect, useState } from "react";
import { Keyboard, Pressable, StyleSheet, View } from "react-native";
import { MyAppText } from "../../../components/text/MyAppText";
import { ThemedButton } from "../../../components/ThemedButton";
import { VideoMetadata } from "../../../db/schema";
import { updateVideoTitleAndDescription } from "../../../services/metadata";
import Feather from "@expo/vector-icons/Feather";

export interface VideoMetadataEditorProps {
  videoId: string;
  videoOriginalDate: Date;
  metadata: VideoMetadata | null;
  onMetadataUpdate: (metadata: VideoMetadata) => void;
}

// Not using dynamic bottom sheet hook (got implementation at src/hooks/useVideoMetadataEditor.tsx)
// because `BottomSheetTextInput` make `BottomSheetModel` crash when keyboard open and it try to
// resize it. Had to use a `BottomSheet` instead.
// see: https://github.com/gorhom/react-native-bottom-sheet/issues/1602
// Todo: replace `VideoMetadataEditor` with `useVideoMetadataEditor` once bug has been fixed (try
// to update `@gorhom/bottom-sheet` with reanimated to latest version and check if bug is still present)
export const VideoMetadataEditor = forwardRef<BottomSheet, VideoMetadataEditorProps>(
  ({ videoId, videoOriginalDate, metadata, onMetadataUpdate }, ref) => {
    const theme = useTheme();
    const { colors } = theme;

    const [title, setTitle] = useState(metadata?.title || "");
    const [description, setDescription] = useState(metadata?.description || "");
    const [isSaving, setIsSaving] = useState(false);

    // Reset form when metadata changes
    useEffect(() => {
      setTitle(metadata?.title || "");
      setDescription(metadata?.description || "");
    }, [metadata]);

    const handleSave = async () => {
      Keyboard.dismiss();
      try {
        setIsSaving(true);
        const updatedMetadata = await updateVideoTitleAndDescription(
          videoId,
          videoOriginalDate,
          title.trim() || null,
          description.trim() || null
        );

        if (updatedMetadata) {
          onMetadataUpdate(updatedMetadata);
        }

        // Close the bottom sheet
        if (ref && typeof ref !== "function" && ref.current) {
          ref.current.close();
        }
      } catch (error) {
        console.error("Failed to update video metadata:", error);
        // TODO: Show error message to user
      } finally {
        setIsSaving(false);
      }
    };

    const handleCancel = () => {
      Keyboard.dismiss();
      // Reset to original values
      setTitle(metadata?.title || "");
      setDescription(metadata?.description || "");

      // Close the bottom sheet
      if (ref && typeof ref !== "function" && ref.current) {
        ref.current.close();
      }
    };

    const renderBackdrop = useCallback(
      (props: any) => <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />,
      []
    );

    return (
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={["70%"]}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.text }}
      >
        <BottomSheetView style={styles.container}>
          <MyAppText style={styles.header} size={20}>
            Edit Video Details
          </MyAppText>

          <View style={styles.formContainer}>
            <View style={styles.inputGroup}>
              <MyAppText size={14} style={styles.label}>
                Title
              </MyAppText>
              <BottomSheetTextInput
                style={[styles.input, { backgroundColor: colors.background, color: colors.text }]}
                value={title}
                onChangeText={setTitle}
                placeholder="Add a title..."
                placeholderTextColor={colors.text + "80"}
                maxLength={100}
              />
            </View>

            <View style={styles.inputGroup}>
              <MyAppText size={14} style={styles.label}>
                Description
              </MyAppText>
              <BottomSheetTextInput
                style={[styles.input, styles.textArea, { backgroundColor: colors.background, color: colors.text }]}
                value={description}
                onChangeText={setDescription}
                placeholder="Add a description..."
                placeholderTextColor={colors.text + "80"}
                multiline
                numberOfLines={4}
                maxLength={500}
              />
            </View>
          </View>

          <View style={styles.buttonContainer}>
            <Pressable onPress={handleCancel} style={{ flex: 1 }}>
              <ThemedButton
                text="Cancel"
                variant="outline"
                size={18}
                Icon={({ iconProps }) => <Feather name="x" {...iconProps} />}
                style={{ width: "100%" }}
              />
            </Pressable>
            <Pressable onPress={handleSave} disabled={isSaving} style={{ flex: 1 }}>
              <ThemedButton
                text={isSaving ? "Saving..." : "Save"}
                variant="filled"
                size={18}
                Icon={({ iconProps }) => <Feather name="check" {...iconProps} />}
                style={{ width: "100%" }}
              />
            </Pressable>
          </View>
        </BottomSheetView>
      </BottomSheet>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  header: {
    fontWeight: "bold",
    marginBottom: 20,
  },
  formContainer: {
    flex: 1,
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontWeight: "600",
  },
  input: {
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  textArea: {
    height: 100,
    textAlignVertical: "top",
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
});
