import { Link, useTheme } from "@react-navigation/native";
import React, { ComponentType } from "react";
import { StyleSheet, View, ViewProps } from "react-native";
import { MyTheme } from "../theme/themes";
import { MyAppText } from "./text/MyAppText";

// ThemedButton
// A simple button respecting the app theme

export interface ThemeButtonProps extends ViewProps {
  Icon?: ComponentType<{ theme: MyTheme; iconProps: { color: string; size: number } }>;
  text?: string;
  variant?: "filled" | "outline";
  themeColor?: "primary" | "secondary" | "accent";
  size?: number;
}

export function ThemedButton({
  Icon,
  text,
  children,
  variant = "filled",
  themeColor = "primary",
  size = 16,
  ...props
}: ThemeButtonProps) {
  const theme = useTheme();
  const { colors } = theme;

  const isOutline = variant === "outline";

  // Get colors based on themeColor selection
  const buttonColor = colors[themeColor];
  const textOnColor = colors[
    `textOn${themeColor.charAt(0).toUpperCase() + themeColor.slice(1)}` as keyof typeof colors
  ] as string;

  const backgroundColor = isOutline ? "transparent" : buttonColor;
  const textColor = isOutline ? buttonColor : textOnColor;

  return (
    <View
      {...props}
      style={[
        styles.defaultButton,
        {
          backgroundColor,
          borderRadius: 10,
          paddingHorizontal: size * 0.5,
          paddingVertical: size * 0.3,
          gap: size * 0.4,
          borderWidth: size * 0.1,
          borderColor: buttonColor,
        },
        props.style,
      ]}
    >
      {Icon && (
        <Icon
          theme={theme}
          iconProps={{
            color: textColor,
            size: size * 0.9,
          }}
        />
      )}
      {text && (
        <MyAppText color={textColor} size={size}>
          {text}
        </MyAppText>
      )}
      {children}
    </View>
  );
}

// RoundIconThemedButton
// A round button with a centered Icon

export interface RoundIconThemedButtonProps extends Omit<ThemeButtonProps, "text"> {
  size?: number;
}

export function RoundIconButton({ size = 40, ...props }: RoundIconThemedButtonProps) {
  return <ThemedButton {...props} style={[styles.roundButton, { height: size, width: size }, props.style]} />;
}

// LinkWrapper

export interface LinkWrapperProps<ChildProps> extends ViewProps {
  to: any;
  childProps: ChildProps & React.Attributes;
}

export function LinkWrapper<ChildProps>(Child: ComponentType<ChildProps>) {
  return ({ to, childProps, ...linkViewProps }: LinkWrapperProps<ChildProps>) => {
    return (
      <Link to={to} {...linkViewProps}>
        <Child {...childProps} />
      </Link>
    );
  };
}

export const LinkButton = LinkWrapper(ThemedButton);
export const LinkIconRoundButton = LinkWrapper(RoundIconButton);

const styles = StyleSheet.create({
  defaultButton: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  roundButton: {
    borderRadius: 100,
    padding: 0,
  },
});
