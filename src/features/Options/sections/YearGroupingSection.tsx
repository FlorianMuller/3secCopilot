import Feather from "@expo/vector-icons/Feather";
import DateTimePicker from "@react-native-community/datetimepicker";
import { View } from "react-native";
import { SegmentedControl } from "../../../components/SegmentedControl";
import preferences from "../../../services/preferences";
import { OptionLine } from "../OptionLine";
import { OptionSection } from "../OptionSection";

export function YearGroupingSection() {
  const { yearGroupingMode, saveYearGroupingMode } = preferences.useYearGroupingModePreference();
  const { birthdayDate, saveBirthdayDate } = preferences.useBirthdayDatePreference();

  return (
    <OptionSection
      title="Year grouping"
      description="Choose how to group videos by year: calendar year (Jan 1 - Dec 31) or by age (birthday to birthday)"
      Icon={({ theme: { colors } }) => <Feather name="calendar" size={25} color={colors.text} />}
    >
      {yearGroupingMode !== undefined && (
        <View style={{ gap: 20 }}>
          <OptionLine label="Grouping mode">
            <SegmentedControl
              options={[
                { label: "Calendar", value: "calendar" },
                { label: "Age", value: "age" },
              ]}
              selectedValue={yearGroupingMode}
              onValueChange={saveYearGroupingMode}
            />
          </OptionLine>

          <OptionLine label="Your birthday">
            <DateTimePicker
              value={birthdayDate || new Date()}
              mode="date"
              display="default"
              onChange={(_, selectedDate) => {
                if (selectedDate) {
                  saveBirthdayDate(selectedDate);
                }
              }}
            />
          </OptionLine>
        </View>
      )}
    </OptionSection>
  );
}
