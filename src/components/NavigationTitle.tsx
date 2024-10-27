import { View } from "react-native";
import { displayTime } from "../utils/dateTime";
import { MyAppText } from "./text/MyAppText";
import { utilStyles } from "../utils/utilStyles";

export interface NavigationTitleProps {
  title?: string;
  subTitle?: string;
}

export function NavigationTitle({ title, subTitle }: NavigationTitleProps) {
  return (
    <View style={utilStyles.center}>
      {title && (
        <MyAppText size={16} weight={500}>
          {title}
        </MyAppText>
      )}
      {subTitle && (
        <MyAppText size={12} weight={400}>
          {subTitle}
        </MyAppText>
      )}
    </View>
  );
}
