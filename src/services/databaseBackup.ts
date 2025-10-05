import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { DateTime } from "luxon";
import { db, expoSqliteDbPath } from "../db/db";
import { preferencesTable, videosMetadataTable } from "../db/schema";

export interface DatabaseBackup {
  exportDate: string;
  version: string;
  tables: {
    videos_metadata: any[];
    preferences: any[];
  };
}

async function createDatabaseBackupFile(): Promise<string> {
  // Fetch all data from tables
  const videosMetadata = await db.select().from(videosMetadataTable);
  const preferences = await db.select().from(preferencesTable);

  // Create consistent timestamp for both JSON content and filename
  const timestamp = DateTime.now();
  const timestampISO = timestamp.toISO();
  const timestampFilename = timestamp.toFormat("yyyy-MM-dd_HH-mm-ss");

  // Create backup object
  const backup: DatabaseBackup = {
    exportDate: timestampISO!,
    version: "1.0.0",
    tables: {
      videos_metadata: videosMetadata,
      preferences: preferences,
    },
  };

  // Convert to JSON
  const backupJson = JSON.stringify(backup, null, 2);

  // Create filename and save to cache directory
  const filename = `3sec-copilot-backup_${timestampFilename}.json`;
  const fileUri = `${FileSystem.cacheDirectory}${filename}`;

  // Write to file
  await FileSystem.writeAsStringAsync(fileUri, backupJson, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return fileUri;
}

export async function exportAndShareDatabase(): Promise<boolean> {
  try {
    const fileUri = await createDatabaseBackupFile();

    // Share the file
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: "application/json",
        dialogTitle: "Export 3sec Copilot Database",
      });
    } else {
      throw new Error("Sharing is not available on this device");
    }

    // Delete the temporary file after sharing
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
    return true;
  } catch (error) {
    console.error("Error exporting database:", error);
    throw error;
  }
}

export async function exportAndShareSqliteDatabase(): Promise<boolean> {
  if (!FileSystem.documentDirectory) {
    throw new Error("Document directory is not available on this platform");
  }

  let dbSourcePath = expoSqliteDbPath;
  let dbInfo = await FileSystem.getInfoAsync(dbSourcePath);

  if (!dbInfo.exists) {
    const fallbackPath = `${FileSystem.documentDirectory}SQLite/db.db`;
    const fallbackInfo = await FileSystem.getInfoAsync(fallbackPath);

    if (fallbackInfo.exists) {
      dbSourcePath = fallbackPath;
      dbInfo = fallbackInfo;
    }
  }

  if (!dbInfo.exists) {
    throw new Error("SQLite database file not found");
  }

  const timestamp = DateTime.now().toFormat("yyyy-MM-dd_HH-mm-ss");
  const tempDbFilename = `3sec-copilot-sqlite_${timestamp}.db`;
  const tempDbPath = `${FileSystem.cacheDirectory}${tempDbFilename}`;

  await FileSystem.copyAsync({ from: dbSourcePath, to: tempDbPath });

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device");
  }

  await Sharing.shareAsync(tempDbPath, {
    mimeType: "application/vnd.sqlite3",
    dialogTitle: "Export 3sec Copilot SQLite Database",
  });

  await FileSystem.deleteAsync(tempDbPath, { idempotent: true });
  return true;
}

async function restoreDatabaseFromBackup(backup: DatabaseBackup): Promise<void> {
  // Validate backup structure
  if (!backup.tables || !backup.version || !backup.exportDate) {
    throw new Error("Invalid backup file format");
  }

  if (!backup.tables.videos_metadata || !backup.tables.preferences) {
    throw new Error("Missing required tables in backup file");
  }

  // Transform date strings back to Date objects for videos metadata
  const processedVideosMetadata = backup.tables.videos_metadata.map((video) => ({
    ...video,
    videoOriginalDate: video.videoOriginalDate ? new Date(video.videoOriginalDate) : null,
    assignedToDate: video.assignedToDate ? new Date(video.assignedToDate) : null,
  }));

  // Clear existing data
  await db.delete(videosMetadataTable);
  await db.delete(preferencesTable);

  // Insert videos metadata
  if (processedVideosMetadata.length > 0) {
    await db.insert(videosMetadataTable).values(processedVideosMetadata);
  }

  // Insert preferences
  if (backup.tables.preferences.length > 0) {
    await db.insert(preferencesTable).values(backup.tables.preferences);
  }
}

export async function selectAndImportDatabase(): Promise<boolean> {
  let fileUri: string | null = null;

  try {
    // Pick a file
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/json",
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return false; // User cancelled
    }

    const file = result.assets[0];
    fileUri = file.uri;

    // Read file contents
    const fileContents = await FileSystem.readAsStringAsync(file.uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    // Parse JSON
    const backup: DatabaseBackup = JSON.parse(fileContents);

    // Restore database
    await restoreDatabaseFromBackup(backup);

    // Delete the imported file from cache
    await FileSystem.deleteAsync(file.uri, { idempotent: true });

    console.log("Database import completed successfully");
    return true;
  } catch (error) {
    console.error("Error importing database:", error);
    // Clean up the file if import failed
    if (fileUri) {
      try {
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
    }
    throw error;
  }
}
