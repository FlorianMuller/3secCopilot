import Feather from "@expo/vector-icons/Feather";
import { SegmentedControl } from "../../../components/SegmentedControl";
import preferences from "../../../services/preferences";
import { OptionLine } from "../OptionLine";
import { OptionSection } from "../OptionSection";

export function LanguageSection() {
  const { appLanguage, saveAppLanguage } = preferences.useAppLanguagePreference();

  return (
    <OptionSection
      title="Language"
      description="For now this only sets the language of the dates shown in exported videos"
      Icon={({ theme: { colors } }) => <Feather name="globe" size={25} color={colors.text} />}
    >
      {appLanguage !== undefined && (
        <OptionLine label="Preferred language">
          <SegmentedControl
            options={[
              { label: "English", value: "en" },
              { label: "Français", value: "fr" },
            ]}
            selectedValue={appLanguage}
            onValueChange={saveAppLanguage}
          />
        </OptionLine>
      )}
    </OptionSection>
  );
}
