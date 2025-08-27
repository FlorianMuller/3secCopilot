import DateTimePicker from "@react-native-community/datetimepicker";
import { useTheme } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { ThemedButton } from "../components/ThemedButton";
import { useDynamicBottomSheet } from "../contexts/DynamicBottomSheetContext";
import { VideoMetadata } from "../db/schema";
import { PhoneMedia } from "../features/CameraRoll/CameraRoll";
import { changeVideoDate } from "../services/metadata";
import { getVideoDatetime } from "../services/videoDatetime";
import { MyAppText } from "../components/text/MyAppText";

interface UseVideoDatetimeEditorProps {
  onDateChange?: (metadata: VideoMetadata) => void;
  onError?: (error: unknown) => void;
}

export function useVideoDatetimeEditor({ onDateChange, onError }: UseVideoDatetimeEditorProps = {}) {
  const theme = useTheme();
  const { openBottomSheet, closeBottomSheet } = useDynamicBottomSheet();

  const openDatetimeEditor = useCallback(
    (video: PhoneMedia) => {
      const DatetimeEditorModal = () => {
        const videoCurrentDate = getVideoDatetime(video);
        const [selectedDate, setSelectedDate] = useState(videoCurrentDate);

        const handleReset = async () => {
          handleChange(null);
        };

        const handleConfirm = async () => {
          handleChange(selectedDate);
        };

        const handleChange = async (newDate: Date | null) => {
          try {
            const newMetadata = await changeVideoDate(video.id, new Date(video.creationTime), newDate);
            closeBottomSheet();
            if (newMetadata && onDateChange) {
              onDateChange(newMetadata);
            }
          } catch (error) {
            if (onError) {
              onError(error);
            }
            return;
          }
        };

        return (
          <View style={{ alignItems: "center", paddingHorizontal: 20 }}>
            <DateTimePicker
              value={selectedDate}
              mode="datetime"
              display="inline"
              accentColor={theme.colors.primary}
              onChange={(_, newDate) => newDate && setSelectedDate(newDate)}
            />
            <Pressable onPress={handleConfirm}>
              <ThemedButton text="Move" style={{ marginTop: 20, width: 300 }} size={20} />
              <Pressable onPress={handleReset}>
                <ThemedButton
                  text={`Reset to ${new Date(video.creationTime).toLocaleDateString()}`}
                  style={{ marginTop: 20, width: 300 }}
                  size={16}
                  variant="outline"
                />
              </Pressable>
            </Pressable>
          </View>
        );
      };

      openBottomSheet(<DatetimeEditorModal />);
    },
    [openBottomSheet, closeBottomSheet, theme.colors.primary, onDateChange, onError]
  );

  return {
    openDatetimeEditor,
  };
}
