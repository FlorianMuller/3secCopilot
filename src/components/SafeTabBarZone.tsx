import { View } from "react-native";
import { tabBarBottomPosition, tabBarHeight } from "./MyTabBar";

const tabBarMaxHeight = tabBarBottomPosition + tabBarHeight;

// View that take the exact space under the tabBar
export function SafeTabBarZone() {
  return <View style={{ height: tabBarMaxHeight, width: "100%" }} />;
}
