import { useTheme } from "@react-navigation/native";
import { StyleSheet, View, ViewProps } from "react-native";

export function Card(props: ViewProps) {
  const theme = useTheme();

  return (
    <View
      {...props}
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.card,
          borderRadius: theme.borderRadius,
        },
        props.style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 10,
  },
});
