import { PropsWithChildren } from "react";
import { View, StyleSheet } from "react-native";

export function AppLayout({ children }: PropsWithChildren<{}>) {
  return <View style={styles.root}>{children}</View>;
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "black",
    height: "100%",
    color: "white",
  },
});
