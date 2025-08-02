import { useTheme } from "@react-navigation/native";
import React, { ComponentType } from "react";
import { StyleProp, View, ViewStyle } from "react-native";
import { MyTheme } from "../theme/themes";
import { utilStyles } from "../utils/utilStyles";

export interface IconBadgeProps {
  Icon: ComponentType<{ theme: MyTheme; size: number }>;
  size?: number;
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
}

export function IconBadge({ Icon, size = 17, backgroundColor, style }: IconBadgeProps) {
  const theme = useTheme();

  const iconSize = size * 0.65;

  return (
    <View
      style={[
        utilStyles.centerRow,
        {
          backgroundColor: backgroundColor || theme.colors.primary,
          borderRadius: 100,
          height: size,
          width: size,
        },
        style,
      ]}
    >
      <Icon theme={theme} size={iconSize} />
    </View>
  );
}
