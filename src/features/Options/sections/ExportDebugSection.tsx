import Feather from "@expo/vector-icons/Feather";
import { Switch } from "react-native";
import preferences from "../../../services/preferences";
import { OptionLine } from "../OptionLine";
import { OptionSection } from "../OptionSection";

// Dev-only (doc/export-device-checklist.md L91): master switch for the export A/V-sync
// debug tools. When on, the Export screen shows its "Debug (A/V sync)" section (date-
// window limiter) and writes a `.debug.jsonl` sidecar next to every export.
export function ExportDebugSection() {
  const { exportDebug, saveExportDebug } = preferences.useExportDebugPreference();

  return (
    <OptionSection
      title="Export debug (dev)"
      description="Write a .debug.jsonl next to each export and show the date-window limiter in the Export tab"
      Icon={({ theme: { colors } }) => <Feather name="terminal" size={25} color={colors.text} />}
    >
      <OptionLine label="Enable export diagnostics">
        <Switch value={exportDebug ?? false} onValueChange={saveExportDebug} />
      </OptionLine>
    </OptionSection>
  );
}
