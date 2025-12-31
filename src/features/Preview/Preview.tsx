import Feather from "@expo/vector-icons/Feather";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeTabBarZone } from "../../components/SafeTabBarZone";
import { MyAppText } from "../../components/text/MyAppText";
import { ThemedButton } from "../../components/ThemedButton";
import { writeJsonFile, writeTextFile } from "../../services/fileExport";

export function Preview() {
  const [isExporting, setIsExporting] = useState(false);

  const handleTestTextExport = async () => {
    try {
      setIsExporting(true);

      const timestamp = new Date().toISOString();
      const content = `Test export from 3sec Copilot
Generated at: ${timestamp}

This is a test file to verify iOS file sharing is working correctly.
You should be able to find this file in the Files app under "3secs Copilot" or "3secs Copilot (Dev)".`;

      const filePath = await writeTextFile("test-export.txt", content);

      Alert.alert(
        "Export Successful",
        `Test file saved!\n\nYou can find it in the Files app under "On My iPhone" > "3secs Copilot"`,
        [{ text: "OK" }]
      );

      console.log("File saved to:", filePath);
    } catch (error) {
      console.error("Export error:", error);
      Alert.alert("Export Failed", `Failed to save test file: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleTestJsonExport = async () => {
    try {
      setIsExporting(true);

      const testData = {
        appName: "3sec Copilot",
        exportType: "test",
        timestamp: new Date().toISOString(),
        testData: {
          message: "This is a test JSON export",
          features: ["video selection", "trimming", "export"],
          version: "1.0.0",
        },
      };

      const filePath = await writeJsonFile("test-export.json", testData);

      Alert.alert(
        "Export Successful",
        `Test JSON file saved!\n\nYou can find it in the Files app under "On My iPhone" > "3secs Copilot"`,
        [{ text: "OK" }]
      );

      console.log("JSON file saved to:", filePath);
    } catch (error) {
      console.error("Export error:", error);
      Alert.alert("Export Failed", `Failed to save test JSON: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <MyAppText size={24} weight={700} style={styles.title}>
          Preview & Export
        </MyAppText>

        <MyAppText size={16} style={styles.description}>
          Export functionality test. These buttons will save test files to the app's Documents folder, which you can
          access through the iOS Files app.
        </MyAppText>

        <View style={styles.buttonsContainer}>
          <MyAppText size={18} weight={600} style={styles.sectionTitle}>
            Test File Export
          </MyAppText>

          <Pressable onPress={handleTestTextExport} disabled={isExporting} style={[isExporting && { opacity: 0.6 }]}>
            <ThemedButton
              variant="outline"
              themeColor="primary"
              text={isExporting ? "Exporting..." : "Export Test Text File"}
              Icon={({ theme }) => <Feather name="file-text" size={20} color={theme.colors.primary} />}
            />
          </Pressable>

          <Pressable onPress={handleTestJsonExport} disabled={isExporting} style={[isExporting && { opacity: 0.6 }]}>
            <ThemedButton
              variant="outline"
              themeColor="primary"
              text={isExporting ? "Exporting..." : "Export Test JSON File"}
              Icon={({ theme }) => <Feather name="code" size={20} color={theme.colors.primary} />}
            />
          </Pressable>

          <MyAppText size={14} style={styles.hint}>
            Tip: After exporting, open the Files app on your iPhone and look for "3secs Copilot" under "On My iPhone"
          </MyAppText>
        </View>

        <SafeTabBarZone />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 30,
  },
  content: {
    gap: 20,
    paddingHorizontal: 20,
  },
  title: {
    marginBottom: 10,
  },
  description: {
    opacity: 0.7,
    lineHeight: 22,
  },
  buttonsContainer: {
    gap: 15,
    marginTop: 20,
  },
  sectionTitle: {
    marginTop: 10,
  },
  hint: {
    opacity: 0.6,
    fontStyle: "italic",
    lineHeight: 20,
    marginTop: 5,
  },
});
