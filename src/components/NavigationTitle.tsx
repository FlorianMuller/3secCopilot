import { View } from "react-native";
import { MyAppText } from "./text/MyAppText";
import { utilStyles } from "../utils/utilStyles";

export interface NavigationTitleProps {
  title?: string;
  subTitle?: string;
  rightSubTItle?: string;
}

export function NavigationTitle({ title, subTitle, rightSubTItle }: NavigationTitleProps) {
  return (
    <View style={utilStyles.centerVertical}>
      {title && (
        <MyAppText size={16} weight={500}>
          {title}
        </MyAppText>
      )}
      <View style={utilStyles.centerRow}>
        {subTitle && <MyAppText size={12}>{subTitle}</MyAppText>}
        {rightSubTItle && (
          <MyAppText
            size={10}
            weight={300}
            style={{
              position: "absolute",
              right: -35,
            }}
          >
            {rightSubTItle}
          </MyAppText>
        )}
      </View>
    </View>
  );
}
