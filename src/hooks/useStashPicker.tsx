import React, { useCallback } from "react";
import { useDynamicBottomSheet } from "../contexts/DynamicBottomSheetContext";
import { PhoneMedia } from "../features/CameraRoll/CameraRoll";
import { StashPickerSheet } from "../features/CameraRoll/StashPickerSheet";
import { chooseStashVideoForDay } from "../services/metadata";
import preferences from "../services/preferences";

interface UseStashPickerProps {
  // Called after a stash video has been assigned + selected for `day`. `newVideo` carries the fresh
  // metadata so the caller can drop it into its list under that day.
  onVideoUsed: (day: Date, newVideo: PhoneMedia) => void;
  // Called when a video is taken out of the stash from the picker, with its refreshed metadata, so the
  // caller can show it again in the camera roll.
  onVideoUnstashed?: (newVideo: PhoneMedia) => void;
  onError?: (error: unknown) => void;
}

export function useStashPicker({ onVideoUsed, onVideoUnstashed, onError }: UseStashPickerProps) {
  const { openBottomSheet, closeBottomSheet } = useDynamicBottomSheet();
  const { dayShift } = preferences.useDayShiftPreference();

  const openStashPicker = useCallback(
    (day: Date) => {
      const handlePick = async (video: PhoneMedia) => {
        try {
          const shift = dayShift || { hour: 0, minute: 0 };
          // Land the assigned date at the day-shift cutoff time so it sits inside the target day's
          // effective window (midnight would shift to the previous day under a non-zero cutoff).
          const assignedToDate = new Date(day.getFullYear(), day.getMonth(), day.getDate(), shift.hour, shift.minute);

          const metadata = await chooseStashVideoForDay(video.id, new Date(video.creationTime), assignedToDate);
          closeBottomSheet();
          if (metadata) {
            onVideoUsed(day, { ...video, metadata });
          }
        } catch (error) {
          if (onError) {
            onError(error);
          } else {
            console.error("Failed to use stash video for day:", error);
          }
        }
      };

      const handleRemove = (newVideo: PhoneMedia) => {
        onVideoUnstashed?.(newVideo);
      };

      openBottomSheet(<StashPickerSheet day={day} onPick={handlePick} onRemove={handleRemove} />, {
        snapPoints: ["70%"],
        enableDynamicSizing: false,
      });
    },
    [openBottomSheet, closeBottomSheet, dayShift, onVideoUsed, onVideoUnstashed, onError]
  );

  return {
    openStashPicker,
  };
}
