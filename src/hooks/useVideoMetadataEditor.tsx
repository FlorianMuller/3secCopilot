import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useTheme } from "@react-navigation/native";
import Feather from "@expo/vector-icons/Feather";
import React, { useCallback, useState } from "react";
import { Keyboard, Pressable, StyleSheet, View } from "react-native";
import { MyAppText } from "../components/text/MyAppText";
import { ThemedButton } from "../components/ThemedButton";
import { VideoMetadata } from "../db/schema";
import { useDynamicBottomSheet } from "../contexts/DynamicBottomSheetContext";
import { updateVideoTitleAndDescription } from "../services/metadata";

interface UseVideoMetadataEditorProps {
  onMetadataUpdate?: (metadata: VideoMetadata) => void;
  onError?: (error: unknown) => void;
}

// See comment in `src/features/CameraRoll/VideoPlayer/VideoMetadataEditor.tsx`
// to know why this is not used
export function useVideoMetadataEditor({ onMetadataUpdate, onError }: UseVideoMetadataEditorProps = {}) {
  const { openBottomSheet, closeBottomSheet } = useDynamicBottomSheet();

  const openMetadataEditor = useCallback(
    (videoId: string, videoOriginalDate: Date, metadata: VideoMetadata | null) => {
      const MetadataEditorModal = () => {
        const { colors } = useTheme();
        const [title, setTitle] = useState(metadata?.title || "");
        const [description, setDescription] = useState(metadata?.description || "");
        const [isSaving, setIsSaving] = useState(false);

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

            closeBottomSheet();
            if (updatedMetadata && onMetadataUpdate) {
              onMetadataUpdate(updatedMetadata);
            }
          } catch (error) {
            if (onError) {
              onError(error);
            }
          } finally {
            setIsSaving(false);
          }
        };

        const handleCancel = () => {
          Keyboard.dismiss();
          closeBottomSheet();
        };

        return (
          <View style={styles.container}>
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
          </View>
        );
      };

      openBottomSheet(<MetadataEditorModal />, { snapPoints: ["70%"], enableDynamicSizing: false });
    },
    [openBottomSheet, closeBottomSheet, onMetadataUpdate, onError]
  );

  return {
    openMetadataEditor,
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    width: "100%",
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
