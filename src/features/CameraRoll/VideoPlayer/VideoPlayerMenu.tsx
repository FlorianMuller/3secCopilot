import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useTheme } from "@react-navigation/native";
import * as DropdownMenu from "zeego/dropdown-menu";

interface VideoPlayerMenuProps {
  onEditMetadata: () => void;
}

export function VideoPlayerMenu({ onEditMetadata }: VideoPlayerMenuProps) {
  const theme = useTheme();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <MaterialCommunityIcons name="dots-vertical" size={24} color={theme.colors.primary} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        <DropdownMenu.Item key="edit-metadata" onSelect={onEditMetadata}>
          <DropdownMenu.ItemTitle>Edit title and description</DropdownMenu.ItemTitle>
          <DropdownMenu.ItemIcon ios={{ name: "pencil" }} />
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
