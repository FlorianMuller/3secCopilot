import Feather from "@expo/vector-icons/Feather";
import { useState } from "react";
import { Alert, Pressable } from "react-native";
import { ThemedButton } from "../../../components/ThemedButton";
import { seedDemoData } from "../../../services/devSeed";
import { OptionSection } from "../OptionSection";

// Dev-only harness (simulator testing) — see services/devSeed.ts
export function DevSeedSection() {
  const [status, setStatus] = useState<string>();

  return (
    <OptionSection
      title="Seed demo data (dev)"
      description="Select every library video and spread them over recent days with trims, titles and gaps"
      Icon={({ theme: { colors } }) => <Feather name="database" size={25} color={colors.text} />}
    >
      <Pressable
        onPress={() =>
          seedDemoData()
            .then(setStatus)
            .catch((e) => {
              console.error("Seed demo data error:", e);
              Alert.alert("Seed demo data failed", String(e));
            })
        }
      >
        <ThemedButton
          variant="outline"
          themeColor="primary"
          text={status ?? "Seed demo data"}
          Icon={({ theme }) => <Feather name="zap" size={20} color={theme.colors.primary} />}
        />
      </Pressable>
    </OptionSection>
  );
}
