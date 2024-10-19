import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { MyAppText } from "./text/MyAppText";
import { TouchableWithoutFeedback, View, useWindowDimensions } from "react-native";
import { StyleSheet } from "react-native";
import { useTheme } from "@react-navigation/native";

export const tabBarHeight = 55;
export const tabBarBottomPosition = 35;

const horizontalPadding = 20;

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();

  return (
    <View style={[styles.tab, { width: width - horizontalPadding * 2, backgroundColor: colors.card }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label =
          options.tabBarLabel !== undefined
            ? options.tabBarLabel
            : options.title !== undefined
            ? options.title
            : route.name;
        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            // The `merge: true` option makes sure that the params inside the tab screen are preserved
            navigation.navigate({ name: route.name, merge: true, params: route.params });
          }
        };

        const onLongPress = () => {
          navigation.emit({
            type: "tabLongPress",
            target: route.key,
          });
        };

        return (
          <TouchableWithoutFeedback
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            testID={options.tabBarTestID}
            onPress={onPress}
            onLongPress={onLongPress}
            key={route.key}
          >
            <View style={styles.icon}>
              {options.tabBarIcon &&
                options.tabBarIcon({ focused: isFocused, size: 29, color: isFocused ? colors.primary : colors.text })}
              {typeof label === "string" && (
                <MyAppText size={10} color={isFocused ? colors.primary : undefined}>
                  {label}
                </MyAppText>
              )}
            </View>
          </TouchableWithoutFeedback>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tab: {
    height: tabBarHeight,
    backgroundColor: "#1b1b1d",
    marginHorizontal: 20,
    borderRadius: 100,
    position: "absolute",
    bottom: tabBarBottomPosition,
    paddingHorizontal: 20,
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  icon: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
});
