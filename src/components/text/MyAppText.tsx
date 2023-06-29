import { useTheme } from "@react-navigation/native";
import { PropsWithChildren } from "react";
import { StyleProp, StyleSheet, Text, ViewStyle } from "react-native";

interface MyAppTextProps {
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export function MyAppText({ children, style, color, size = 16 }: PropsWithChildren<MyAppTextProps>) {
  const { colors } = useTheme();

  return <Text style={[{ color: color || colors.text, fontSize: size }, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  defaultText: {
    color: "white",
  },
});
