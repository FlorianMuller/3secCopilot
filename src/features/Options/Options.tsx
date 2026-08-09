import { ScrollView, View } from "react-native";
import { MyAppText } from "../../components/text/MyAppText";
import { DayShiftSection } from "./sections/DayShiftSection";
import { LanguageSection } from "./sections/LanguageSection";
import { YearGroupingSection } from "./sections/YearGroupingSection";
import { CacheOptionSection } from "./sections/CacheOptionSection";
import { DatabaseBackupSection } from "./sections/DatabaseBackupSection";
import { DevSeedSection } from "./sections/DevSeedSection";
import { ExportDebugSection } from "./sections/ExportDebugSection";
import { ExportSpikeSection } from "./sections/ExportSpikeSection";
import { BuildInfoSection } from "./sections/BuildInfoSection";
import { SafeTabBarZone } from "../../components/SafeTabBarZone";

export function Options() {
  return (
    <ScrollView style={{ paddingTop: 30 }}>
      <View style={{ gap: 20 }}>
        <LanguageSection />

        <YearGroupingSection />

        <DayShiftSection />

        <MyAppText size={20} weight={700} style={{ marginLeft: 5, marginTop: 20 }}>
          Advanced
        </MyAppText>

        <DatabaseBackupSection />

        <CacheOptionSection />

        <ExportSpikeSection />

        {__DEV__ && <DevSeedSection />}

        {__DEV__ && <ExportDebugSection />}

        <BuildInfoSection />

        <SafeTabBarZone />
      </View>
    </ScrollView>
  );
}
