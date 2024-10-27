import { View, Text, Pressable } from "react-native";
import { MyAppText } from "../../components/text/MyAppText";
import { ThemedButton } from "../../components/ThemedButton";
import * as FileSystem from "expo-file-system";
import { thumbnailCacheDir } from "../CameraRoll/mediaService";

export function Options() {
  return (
    <View>
      <Text>
        <MyAppText>Welcome to settings</MyAppText>;
      </Text>

      <Pressable
        style={{ marginVertical: 30 }}
        onPress={async () => {
          try {
            await FileSystem.deleteAsync(thumbnailCacheDir);
            console.log("thumbnail cache dir deleted");
          } catch (e) {
            console.error("error while deleting thumnail cache dir", e);
          }
        }}
      >
        <ThemedButton text="Delete thumbnail cache" />
      </Pressable>
    </View>
  );
}
