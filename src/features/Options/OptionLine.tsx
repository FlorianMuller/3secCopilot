import { View, ViewProps } from "react-native";
import { MyAppText, MyAppTextProps } from "../../components/text/MyAppText";
import { PropsWithChildren } from "react";

export interface OptionLineProps extends ViewProps {
  label?: string;
}

export function OptionLine({ label, children, ...viewProps }: OptionLineProps) {
  return (
    <View
      {...viewProps}
      style={[
        {
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },
        viewProps.style,
      ]}
    >
      {label && <OptionLabel>{label}</OptionLabel>}
      {children}
    </View>
  );
}

export function OptionLabel({ children, ...textProps }: PropsWithChildren<MyAppTextProps>) {
  return (
    <MyAppText size={16} weight={600} {...textProps}>
      {children}
    </MyAppText>
  );
}
