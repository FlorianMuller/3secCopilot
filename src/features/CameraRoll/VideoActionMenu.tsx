import React from "react";
import * as ContextMenu from "zeego/context-menu";
import { VideoMetadata } from "../../db/schema";
import { PhoneMedia } from "./CameraRoll";
import { toggleVideoSelection } from "../../services/videoSelection";

interface VideoActionMenuProps {
  children: React.ReactNode;
  video: PhoneMedia;
  dayContext: Date;
  onMetadataUpdate: (videoId: string, metadata: VideoMetadata) => void;
}

export const VideoActionMenu = ({ children, video, dayContext, onMetadataUpdate }: VideoActionMenuProps) => {
  const handleSelectVideo = async () => {
    try {
      const newMetadata = await toggleVideoSelection(video, video.metadata || null, dayContext);
      if (newMetadata) {
        onMetadataUpdate(video.id, newMetadata);
      }
    } catch (e) {
      console.error("Error toggling video selection:", e);
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
        <ContextMenu.Item key={"Move to an other day"}>
          <ContextMenu.ItemTitle>Move to an other day</ContextMenu.ItemTitle>
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