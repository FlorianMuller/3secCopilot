import { PropsWithChildren } from "react";
import { StyleProp, StyleSheet, Text, ViewStyle } from "react-native";

interface MyAppTextProps {
  style?: StyleProp<ViewStyle>;
}

export function MyAppText({ children, style }: PropsWithChildren<MyAppTextProps>) {
  return <Text style={[styles.defaultText, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  defaultText: {
    color: "white",
  },
});
