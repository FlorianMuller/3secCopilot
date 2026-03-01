import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@react-navigation/native";
import { useState } from "react";
import { Alert, Pressable } from "react-native";
import { ThemedButton } from "../../../components/ThemedButton";
import { exportAndShareDatabase, selectAndImportDatabase } from "../../../services/databaseBackup";
import { OptionSection } from "../OptionSection";

export function DatabaseBackupSection() {
  const theme = useTheme();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  async function handleExport() {
    try {
      setIsExporting(true);
      await exportAndShareDatabase();
    } catch (error) {
      console.error("Export error:", error);
      Alert.alert("Export Failed", "Failed to export database. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }

  async function handleImport() {
    Alert.alert("Import Database", "This will replace all your current data. Are you sure you want to continue?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Import",
        style: "destructive",
        onPress: async () => {
          try {
            setIsImporting(true);
            await selectAndImportDatabase();
          } catch (error) {
            console.error("Import error:", error);
            Alert.alert("Import Failed", "Failed to import database. Please try again.");
          } finally {
            setIsImporting(false);
          }
        },
      },
    ]);
  }

  return (
    <OptionSection
      title="Database Backup"
      description="Export and import your video metadata and preferences"
      Icon={({ theme: { colors } }) => <Feather name="database" size={25} color={colors.text} />}
    >
      {/* Export Button */}
      <Pressable onPress={handleExport} disabled={isExporting} style={isExporting ? { opacity: 0.6 } : undefined}>
        <ThemedButton
          variant="outline"
          themeColor="primary"
          text={isExporting ? "Exporting..." : "Export Database"}
          Icon={({ theme }) => <Feather name="upload" size={20} color={theme.colors.primary} />}
        />
      </Pressable>

      {/* Import Button */}
      <Pressable onPress={handleImport} disabled={isImporting} style={isImporting ? { opacity: 0.6 } : undefined}>
        <ThemedButton
          variant="outline"
          themeColor="primary"
          text={isImporting ? "Importing..." : "Import Database"}
          Icon={({ theme }) => <Feather name="download" size={20} color={theme.colors.primary} />}
        />
      </Pressable>
    </OptionSection>
  );
}
