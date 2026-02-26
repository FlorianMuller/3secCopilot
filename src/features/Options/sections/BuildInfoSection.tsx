import Feather from "@expo/vector-icons/Feather";
import { View } from "react-native";
import { DateTime } from "luxon";
import { MyAppText } from "../../../components/text/MyAppText";
import { OptionLine } from "../OptionLine";
import { OptionSection } from "../OptionSection";
import { buildInfo } from "../../../constants/buildInfo";

export function BuildInfoSection() {
  const formattedDate = DateTime.fromISO(buildInfo.buildTimestamp).toLocaleString(DateTime.DATETIME_MED);

  return (
    <OptionSection
      title="Build Information"
      Icon={({ theme: { colors } }) => <Feather name="info" size={25} color={colors.text} />}
    >
      <View style={{ gap: 12 }}>
        <OptionLine label="Version">
          <MyAppText>{buildInfo.version}</MyAppText>
        </OptionLine>
        <OptionLine label="Commit">
          <MyAppText>{buildInfo.gitCommitHash}</MyAppText>
        </OptionLine>
        <OptionLine label="Built">
          <MyAppText>{formattedDate}</MyAppText>
        </OptionLine>
        <OptionLine label="Build">
          <MyAppText>{buildInfo.buildMode}</MyAppText>
        </OptionLine>
      </View>
    </OptionSection>
  );
}
