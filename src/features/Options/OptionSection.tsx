import { useTheme } from "@react-navigation/native";
import { ComponentType } from "react";
import { View, ViewProps } from "react-native";
import { Card } from "../../components/card";
import { MyAppText } from "../../components/text/MyAppText";
import { MyTheme } from "../../theme/themes";
import { utilStyles } from "../../utils/utilStyles";

export interface OptionSectionProps extends ViewProps {
  title?: string;
  description?: string;
  Icon?: ComponentType<{ theme: MyTheme }>;
}

export function OptionSection({ title, description, Icon, children, ...viewProps }: OptionSectionProps) {
  const theme = useTheme();

  return (
    <Card {...viewProps} style={{ marginHorizontal: 10, gap: 3 }}>
      {(title || Icon) && (
        <View style={[utilStyles.ListRow, { gap: 5 }]}>
          {Icon && <Icon theme={theme} />}
          {title && (
            <MyAppText size={20} weight={600}>
              {title}
            </MyAppText>
          )}
        </View>
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
