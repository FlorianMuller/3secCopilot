import Feather from "@expo/vector-icons/Feather";
import { Picker } from "@react-native-picker/picker";
import { useTheme } from "@react-navigation/native";
import { StyleSheet, View } from "react-native";
import preferences from "../../../services/preferences";
import { utilStyles } from "../../../utils/utilStyles";
import { OptionSection } from "../OptionSection";

const hours = [...Array(24).keys()];
const minutes = [...Array(60).keys()];

export interface DayShiftTime {
  minute: number;
  hour: number;
}
const a = {};
export function DayShiftSection() {
  const theme = useTheme();
  const { dayShift, saveDayShift } = preferences.useDayShiftPreference();

  return (
    <OptionSection
      title="Day shift"
      description="As we sometimes live and go to bed past midnight, this option allow you to assign video past midnight and until the chosen hour to the previous day"
      Icon={({ theme: { colors } }) => <Feather name="moon" size={29} color={colors.text} />}
    >
      {dayShift !== undefined && (
        <View style={utilStyles.centerRow}>
          <Picker
            style={styles.picker}
            mode="dropdown"
            itemStyle={{ color: "white" }}
            selectedValue={dayShift.hour}
            onValueChange={(itemValue, itemIndex) => {
              saveDayShift({ hour: itemValue, minute: dayShift.minute });
            }}
          >
            {hours.map((hour) => (
              <Picker.Item label={`${hour}`} value={hour} key={hour} color={theme.colors.text} />
            ))}
          </Picker>
          <Picker
            style={styles.picker}
            selectedValue={dayShift.minute}
            onValueChange={(itemValue, itemIndex) => {
              saveDayShift({ hour: dayShift.hour, minute: itemValue });
            }}
          >
            {minutes.map((minute) => (
              <Picker.Item label={`${minute}`} value={minute} key={minute} color={theme.colors.text} />
            ))}
          </Picker>
        </View>
      )}
    </OptionSection>
  );
}

const styles = StyleSheet.create({
  picker: {
    height: 200,
    width: 100,
  },
});
