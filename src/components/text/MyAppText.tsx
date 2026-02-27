import { useTheme } from "@react-navigation/native";
import { PropsWithChildren } from "react";
import { StyleProp, StyleSheet, Text, TextStyle, ViewStyle } from "react-native";

export interface MyAppTextProps {
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  italic?: boolean;
  weight?: TextStyle["fontWeight"];
}

export function MyAppText({
  children,
  style,
  color,
  weight,
  size = 16,
  italic = false,
}: PropsWithChildren<MyAppTextProps>) {
  const { colors } = useTheme();

  return (
    <Text
      style={[
        { color: color || colors.text, fontSize: size, fontStyle: italic ? "italic" : "normal", fontWeight: weight },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
