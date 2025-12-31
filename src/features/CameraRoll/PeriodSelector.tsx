import { StyleSheet, View } from "react-native";
import * as DropdownMenu from "zeego/dropdown-menu";
import { MyAppText } from "../../components/text/MyAppText";
import { Period } from "./hooks/usePeriod";

interface PeriodSelectorProps {
  periods: Period[];
  selectedPeriod: Period;
  onSelectPeriod: (periodId: string) => void;
}

export function PeriodSelector({ periods, selectedPeriod, onSelectPeriod }: PeriodSelectorProps) {
  return (
    <View style={styles.container}>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <View style={styles.trigger}>
            <MyAppText weight={600}>{selectedPeriod.label}</MyAppText>
          </View>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          {periods.map((period) => (
            <DropdownMenu.Item key={period.id} onSelect={() => onSelectPeriod(period.id)}>
              <DropdownMenu.ItemTitle>{period.label}</DropdownMenu.ItemTitle>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 50,
    left: 0,
    right: 0,
    zIndex: 101, // Above LinearGradient (zIndex 100)
    alignItems: "center",
    paddingVertical: 8,
  },
  trigger: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.7)", // Semi-transparent background
  },
});
