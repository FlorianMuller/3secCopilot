import React from "react";
import * as ContextMenu from "zeego/context-menu";
import { VideoMetadata } from "../../db/schema";
import { PhoneMedia } from "./CameraRoll";
import { toggleVideoSelection } from "../../services/videoSelection";
import { useVideoTrim } from "../../hooks/useVideoTrim";
import { useVideoDatetimeEditor } from "../../hooks/useVideoDatetimeEditor";
import * as MediaLibrary from "expo-media-library";

interface VideoActionMenuProps {
  children: React.ReactNode;
  video: PhoneMedia;
  dayContext: Date;
  onMetadataUpdate?: (videoId: string, metadata: VideoMetadata) => void;
}

export const VideoActionMenu = ({ children, video, dayContext, onMetadataUpdate }: VideoActionMenuProps) => {
  const handleSelectVideo = async () => {
    try {
      const newMetadata = await toggleVideoSelection(video, video.metadata || null, dayContext);
      if (newMetadata && onMetadataUpdate) {
        onMetadataUpdate(video.id, newMetadata);
      }
    } catch (e) {
      console.error("Error toggling video selection:", e);
    }
  };

  const { openTrimEditor } = useVideoTrim({
    onTrimComplete: (result) => {
      if (onMetadataUpdate) {
        onMetadataUpdate(result.metadata.videoId, result.metadata);
      }
    },
    onError: () => {
      // Todo: show error toast/alert
    },
  });

  const { openDatetimeEditor } = useVideoDatetimeEditor({
    onDateChange: (newMetadata) => {
      if (onMetadataUpdate) {
        onMetadataUpdate(video.id, newMetadata);
      }
    },
    onError: (error) => {
      // Todo: show error toast/alert
      console.error("Error changing video date:", error);
    },
  });

  const handleTrimVideo = async () => {
    try {
      if (video.info === undefined) {
        video.info = await MediaLibrary.getAssetInfoAsync(video.id);
      }
      await openTrimEditor(video.info);
    } catch (e) {
      console.error("Error opening video trimmer:", e);
    }
  };

  const isSelected = video.metadata?.isSelected;

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger>{children}</ContextMenu.Trigger>
      <ContextMenu.Content>
        <ContextMenu.Item key={"Select"} onSelect={handleSelectVideo}>
          <ContextMenu.ItemTitle>{isSelected ? "Unselect" : "Select"}</ContextMenu.ItemTitle>
          <ContextMenu.ItemIcon
            ios={{
              name: isSelected ? "checkmark.circle" : "circle",
            }}
          />
        </ContextMenu.Item>
        <ContextMenu.Item key={"Trim"} onSelect={handleTrimVideo}>
          <ContextMenu.ItemTitle>Trim</ContextMenu.ItemTitle>
          <ContextMenu.ItemIcon
            ios={{
              name: "scissors",
            }}
          />
        </ContextMenu.Item>

        <ContextMenu.Item key={"Move to an other day"} onSelect={() => openDatetimeEditor(video)}>
          <ContextMenu.ItemTitle>Move to another day</ContextMenu.ItemTitle>
          <ContextMenu.ItemIcon
            ios={{
              name: "clock.arrow.trianglehead.counterclockwise.rotate.90",
            }}
          />
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Root>
  );
};
