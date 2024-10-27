import { Link, Theme, useTheme } from "@react-navigation/native";
import React, { ComponentType } from "react";
import { StyleSheet, View, ViewProps } from "react-native";
import { MyAppText } from "./text/MyAppText";

// ThemedButton
// A simple button respecting the app theme

export interface ThemeButtonProps extends ViewProps {
  Icon?: ComponentType<{ theme: Theme }>;
  text?: string;
}

export function ThemedButton({ Icon, text, children, ...props }: ThemeButtonProps) {
  const theme = useTheme();
  const { colors } = theme;

  return (
    <View {...props} style={[styles.defaultButton, { backgroundColor: colors.primary, borderRadius: 20 }, props.style]}>
      {Icon && <Icon theme={theme} />}
      {text && <MyAppText color={theme.colors.textOnPrimary}>{text}</MyAppText>}
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
    padding: 10,
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  roundButton: {
    borderRadius: 100,
    padding: 0,
  },
});
