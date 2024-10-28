import { ScrollView, View } from "react-native";
import { MyAppText } from "../../components/text/MyAppText";
import { DayShiftSection } from "./sections/DayShiftSection";
import { ThumbnailCacheOptionSection } from "./sections/ThumbnailCacheOptionSection";

export function Options() {
  return (
    <ScrollView style={{ paddingTop: 30 }}>
      <View style={{ gap: 20 }}>
        <DayShiftSection />

        <MyAppText size={20} weight={700} style={[{ marginLeft: 5, marginTop: 20 }]}>
          Advanced
        </MyAppText>

        <ThumbnailCacheOptionSection />
      </View>
    </ScrollView>
  );
}
