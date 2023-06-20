import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import CameraRoll from "./src/features/CameraRoll/CameraRoll";

export default function App() {
  return (
    <View style={styles.root}>
      <CameraRoll startDate={new Date()}></CameraRoll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "black",
    height: "100%",
    color: "white",
  },
});
