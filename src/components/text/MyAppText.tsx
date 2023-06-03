import { PropsWithChildren } from "react";
import { StyleSheet, Text } from "react-native";

export function MyAppText({ children }: PropsWithChildren<{}>) {
  return <Text style={styles.defaultText}>{children}</Text>;
}

const styles = StyleSheet.create({
  defaultText: {
    color: "white",
  },
});
