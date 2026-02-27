import { useState } from "react";
import { StyleSheet, View } from "react-native";
import * as DropdownMenu from "zeego/dropdown-menu";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { MyAppText } from "../../components/text/MyAppText";
import { Period } from "./hooks/usePeriod";

interface PeriodSelectorProps {
  periods: Period[];
  selectedPeriod: Period;
  onSelectPeriod: (periodId: string) => void;
}

export function PeriodSelector({ periods, selectedPeriod, onSelectPeriod }: PeriodSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <View style={styles.container}>
      <DropdownMenu.Root
        onOpenChange={setIsOpen}
        // @ts-expect-error - onOpenWillChange exists at runtime on iOS but not in type definitions
        onOpenWillChange={setIsOpen}
      >
        <DropdownMenu.Trigger>
          <View style={styles.trigger}>
            <MyAppText weight={800}>{selectedPeriod.label}</MyAppText>
            <MaterialCommunityIcons
              name={isOpen ? "chevron-up" : "chevron-down"}
              size={20}
              color="white"
              style={styles.icon}
            />
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
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.7)", // Semi-transparent background
  },
  icon: {
    marginTop: 1, // Fine-tune vertical alignment
  },
});
