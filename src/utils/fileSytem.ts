import * as FileSystem from "expo-file-system";

export async function ensureDirExists(dir: string) {
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

export async function doesFileExists(fileUri: string): Promise<boolean> {
  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  return fileInfo.exists;
}
