import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@react-navigation/native";
import { useState } from "react";
import { Alert, Pressable } from "react-native";
import { ThemedButton } from "../../../components/ThemedButton";
import {
  exportAndShareAppFileSystem,
  exportAndShareDatabase,
  exportAndShareSqliteDatabase,
  selectAndImportDatabase,
} from "../../../services/databaseBackup";
import { OptionSection } from "../OptionSection";

export function DatabaseBackupSection() {
  const theme = useTheme();
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingSqlite, setIsExportingSqlite] = useState(false);
  const [isExportingAppFiles, setIsExportingAppFiles] = useState(false);
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

  async function handleExportSqlite() {
    try {
      setIsExportingSqlite(true);
      await exportAndShareSqliteDatabase();
    } catch (error) {
      console.error("SQLite export error:", error);
      Alert.alert("Export Failed", "Failed to export SQLite database. Please try again.");
    } finally {
      setIsExportingSqlite(false);
    }
  }

  async function handleExportAppFiles() {
    try {
      setIsExportingAppFiles(true);
      await exportAndShareAppFileSystem();
    } catch (error) {
      console.error("App files export error:", error);
      Alert.alert("Export Failed", "Failed to export app files. Please try again.");
    } finally {
      setIsExportingAppFiles(false);
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
      <Pressable onPress={handleExport} disabled={isExporting} style={[isExporting && { opacity: 0.6 }]}>
        <ThemedButton
          variant="outline"
          themeColor="primary"
          text={isExporting ? "Exporting..." : "Export Database"}
          Icon={({ theme }) => <Feather name="upload" size={20} color={theme.colors.primary} />}
        />
      </Pressable>

      {/* Import Button */}
      <Pressable onPress={handleImport} disabled={isImporting} style={[isImporting && { opacity: 0.6 }]}>
        <ThemedButton
          variant="outline"
          themeColor="primary"
          text={isImporting ? "Importing..." : "Import Database"}
          Icon={({ theme }) => <Feather name="download" size={20} color={theme.colors.primary} />}
        />
      </Pressable>

      {/* Export SQLite Button */}
      <Pressable
        onPress={handleExportSqlite}
        disabled={isExportingSqlite}
        style={[isExportingSqlite && { opacity: 0.6 }]}
      >
        <ThemedButton
          variant="outline"
          themeColor="primary"
          text={isExportingSqlite ? "Exporting..." : "Export SQLite File"}
          Icon={({ theme }) => <Feather name="hard-drive" size={20} color={theme.colors.primary} />}
        />
      </Pressable>

      {/* Export App Files Button */}
      <Pressable
        onPress={handleExportAppFiles}
        disabled={isExportingAppFiles}
        style={[isExportingAppFiles && { opacity: 0.6 }]}
      >
        <ThemedButton
          variant="outline"
          themeColor="primary"
          text={isExportingAppFiles ? "Exporting..." : "Export App Files"}
          Icon={({ theme }) => <Feather name="archive" size={20} color={theme.colors.primary} />}
        />
      </Pressable>
    </OptionSection>
  );
}
