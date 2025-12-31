import Feather from "@expo/vector-icons/Feather";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Picker } from "@react-native-picker/picker";
import { useTheme } from "@react-navigation/native";
import { StyleSheet, View } from "react-native";
import { MyAppText } from "../../../components/text/MyAppText";
import preferences from "../../../services/preferences";
import { OptionSection } from "../OptionSection";
import { YearGroupingMode } from "./YearGrouping";

export function YearGroupingSection() {
  const theme = useTheme();
  const { yearGroupingMode, saveYearGroupingMode } = preferences.useYearGroupingModePreference();
  const { birthdayDate, saveBirthdayDate } = preferences.useBirthdayDatePreference();

  return (
    <OptionSection
      title="Year grouping"
      description="Choose how to group videos by year: calendar year (Jan 1 - Dec 31) or by age (birthday to birthday)"
      Icon={({ theme: { colors } }) => <Feather name="calendar" size={25} color={colors.text} />}
    >
      {yearGroupingMode !== undefined && (
        <View style={{ gap: 50 }}>
          <View>
            <MyAppText size={16} weight={600} style={{ marginBottom: 8 }}>
              Grouping mode
            </MyAppText>
            <Picker
              style={styles.picker}
              selectedValue={yearGroupingMode}
              onValueChange={(itemValue) => saveYearGroupingMode(itemValue as YearGroupingMode)}
            >
              <Picker.Item label="Calendar" value="calendar" color={theme.colors.text} />
              <Picker.Item label="Birthday" value="birthday" color={theme.colors.text} />
            </Picker>
          </View>

          {yearGroupingMode === "birthday" && (
            <View
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <MyAppText size={16} weight={600} style={{ marginBottom: 8 }}>
                Your birthday
              </MyAppText>
              {birthdayDate !== undefined && (
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
              )}
            </View>
          )}
        </View>
      )}
    </OptionSection>
  );
}

const styles = StyleSheet.create({
  picker: {
    // height: 120,
    // backgroundColor: "red",
  },
});
