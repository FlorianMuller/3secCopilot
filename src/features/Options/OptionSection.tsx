import { View, ViewProps } from "react-native";
import { MyAppText } from "../../components/text/MyAppText";
import { useTheme } from "@react-navigation/native";
import { Card } from "../../components/card";

export interface OptionSectionProps extends ViewProps {
  title?: string;
  description?: string;
}

export function OptionSection({ title, description, children, ...viewProps }: OptionSectionProps) {
  const { colors } = useTheme();
  return (
    <Card {...viewProps} style={{ margin: 10 }}>
      {title && (
        <MyAppText size={20} weight={600}>
          {title}
        </MyAppText>
      )}
      {description && (
        <MyAppText italic size={14}>
          {description}
        </MyAppText>
      )}
      {/* List of options in the section */}
      <View style={{ display: "flex", gap: 15, paddingVertical: 20, paddingHorizontal: 5 }}>{children}</View>
    </Card>
  );
}
