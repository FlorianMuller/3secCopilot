import React from "react";
import * as ContextMenu from "zeego/context-menu";

interface VideoActionMenuProps {
  children: React.ReactNode;
}

export const VideoActionMenu = ({ children }: VideoActionMenuProps) => {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger>{children}</ContextMenu.Trigger>
      <ContextMenu.Content>
        <ContextMenu.Item key={"Select"}>
          <ContextMenu.ItemTitle>Select</ContextMenu.ItemTitle>
          <ContextMenu.ItemIcon
            ios={{
              name: "checkmark",
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