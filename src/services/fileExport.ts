import * as FileSystem from "expo-file-system";

/**
 * Gets the path to the app's Documents directory.
 * This directory is accessible through the iOS Files app when file sharing is enabled.
 */
export const getDocumentsDirectory = (): string => {
  if (!FileSystem.documentDirectory) {
    throw new Error("Document directory is not available");
  }
  return FileSystem.documentDirectory;
};

/**
 * Writes a text file to the Documents directory.
 * The file will be accessible through the iOS Files app.
 *
 * @param filename - Name of the file to create (e.g., "export.txt" or "data.json")
 * @param content - Content to write to the file
 * @returns The full path to the created file
 */
export const writeTextFile = async (filename: string, content: string): Promise<string> => {
  const documentsDir = getDocumentsDirectory();
  const filePath = `${documentsDir}${filename}`;

  await FileSystem.writeAsStringAsync(filePath, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return filePath;
};

/**
 * Writes a JSON file to the Documents directory.
 * The file will be accessible through the iOS Files app.
 *
 * @param filename - Name of the file to create (e.g., "export.json")
 * @param data - JavaScript object to serialize as JSON
 * @returns The full path to the created file
 */
export const writeJsonFile = async (filename: string, data: unknown): Promise<string> => {
  const jsonContent = JSON.stringify(data, null, 2);
  return writeTextFile(filename, jsonContent);
};

/**
 * Checks if a file exists in the Documents directory.
 *
 * @param filename - Name of the file to check
 * @returns true if the file exists, false otherwise
 */
export const fileExists = async (filename: string): Promise<boolean> => {
  const documentsDir = getDocumentsDirectory();
  const filePath = `${documentsDir}${filename}`;

  const info = await FileSystem.getInfoAsync(filePath);
  return info.exists;
};

/**
 * Lists all files in the Documents directory.
 *
 * @returns Array of filenames in the Documents directory
 */
export const listDocumentsDirectory = async (): Promise<string[]> => {
  const documentsDir = getDocumentsDirectory();
  return FileSystem.readDirectoryAsync(documentsDir);
};
