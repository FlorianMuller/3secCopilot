import { ScrollView, View } from "react-native";
import { MyAppText } from "../../components/text/MyAppText";
import { DayShiftSection } from "./sections/DayShiftSection";
import { CacheOptionSection } from "./sections/CacheOptionSection";

export function Options() {
  return (
    <ScrollView style={{ paddingTop: 30 }} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={{ gap: 20 }}>
        <DayShiftSection />

        <MyAppText size={20} weight={700} style={[{ marginLeft: 5, marginTop: 20 }]}>
          Advanced
        </MyAppText>

        <CacheOptionSection />
      </View>
    </ScrollView>
  );
}
