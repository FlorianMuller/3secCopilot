import { useTheme } from "@react-navigation/native";
import { Pressable, StyleSheet, View, ViewProps } from "react-native";
import { MyAppText } from "./text/MyAppText";

export interface SegmentedControlOption<T extends string> {
  label: string;
  value: T;
}

export interface SegmentedControlProps<T extends string> extends ViewProps {
  options: SegmentedControlOption<T>[];
  selectedValue: T;
  onValueChange: (value: T) => void;
  themeColor?: "primary" | "secondary" | "accent";
  size?: number;
}

export function SegmentedControl<T extends string>({
  options,
  selectedValue,
  onValueChange,
  themeColor = "primary",
  size = 16,
  ...props
}: SegmentedControlProps<T>) {
  const theme = useTheme();
  const { colors } = theme;

  const buttonColor = colors[themeColor];
  const textOnColor = colors[
    `textOn${themeColor.charAt(0).toUpperCase() + themeColor.slice(1)}` as keyof typeof colors
  ] as string;

  const borderWidth = Math.round(size * 0.1);

  return (
    <View {...props} style={[styles.container, { gap: 0 }, props.style]}>
      {options.map((option, index) => {
        const isSelected = option.value === selectedValue;
        const isFirst = index === 0;
        const isLast = index === options.length - 1;

        const backgroundColor = isSelected ? buttonColor : "transparent";
        const textColor = isSelected ? textOnColor : buttonColor;

        return (
          <Pressable
            key={option.value}
            onPress={() => onValueChange(option.value)}
            style={[
              styles.segment,
              {
                backgroundColor,
                borderColor: buttonColor,
                borderWidth,
                paddingHorizontal: size * 0.8,
                paddingVertical: size * 0.5,
                borderTopLeftRadius: isFirst ? 10 : 0,
                borderBottomLeftRadius: isFirst ? 10 : 0,
                borderTopRightRadius: isLast ? 10 : 0,
                borderBottomRightRadius: isLast ? 10 : 0,
                ...(isFirst ? {} : { borderLeftWidth: 0 }),
              },
            ]}
          >
            <MyAppText color={textColor} size={size} weight={isSelected ? 600 : 400}>
              {option.label}
            </MyAppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
  },
  segment: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
});
