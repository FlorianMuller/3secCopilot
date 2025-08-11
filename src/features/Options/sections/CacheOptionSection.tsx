import Feather from "@expo/vector-icons/Feather";
import * as FileSystem from "expo-file-system";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { MyAppText } from "../../../components/text/MyAppText";
import { formatBytes } from "../../../utils/formatBytes";
import { OptionSection } from "../OptionSection";
import { useTheme } from "@react-navigation/native";

interface CacheDirectory {
  name: string;
  size: number;
  path: string;
}

export function CacheOptionSection() {
  const theme = useTheme();
  const [cacheDirectories, setCacheDirectories] = useState<CacheDirectory[]>([]);
  const [totalCacheSize, setTotalCacheSize] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadCacheDirectories();
  }, []);

  async function loadCacheDirectories() {
    try {
      setIsLoading(true);

      if (!FileSystem.cacheDirectory) {
        setCacheDirectories([]);
        setTotalCacheSize(0);
        setIsLoading(false);
        return;
      }

      // Get all directories in cache
      const directories = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory);
      const cacheData: CacheDirectory[] = [];
      let total = 0;

      for (const dirName of directories) {
        const dirPath = FileSystem.cacheDirectory + dirName;
        try {
          const dirInfo = await FileSystem.getInfoAsync(dirPath, { size: true });
          if (dirInfo.exists && dirInfo.isDirectory) {
            const size = dirInfo.size || 0;
            cacheData.push({
              name: dirName,
              size: size,
              path: dirPath,
            });
            total += size;
          }
        } catch (e) {
          console.error(`Error getting info for directory ${dirName}:`, e);
        }
      }

      // Sort by size (largest first)
      cacheData.sort((a, b) => b.size - a.size);
      setCacheDirectories(cacheData);

      const cacheDirInfo = await FileSystem.getInfoAsync(FileSystem.cacheDirectory, { size: true });
      if (cacheDirInfo.exists && cacheDirInfo.isDirectory) {
        setTotalCacheSize(cacheDirInfo.size);
      }
    } catch (e) {
      console.error("Error loading cache directories:", e);
      setCacheDirectories([]);
      setTotalCacheSize(0);
    } finally {
      setIsLoading(false);
    }
  }

  async function deleteCacheDirectory(directory: CacheDirectory) {
    try {
      await FileSystem.deleteAsync(directory.path);
      await loadCacheDirectories(); // Refresh the list
      console.log(`Cache directory ${directory.name} deleted`);
    } catch (e) {
      console.error(`Error deleting cache directory ${directory.name}:`, e);
    }
  }

  const totalSizeDisplay = isLoading ? "Loading..." : formatBytes(totalCacheSize);

  return (
    <OptionSection
      title="Cache Management"
      description="Manage application cache directories"
      Icon={({ theme: { colors } }) => <Feather name="archive" size={25} color={colors.text} />}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <MyAppText>Total cache size: {totalSizeDisplay}</MyAppText>
        <Pressable onPress={loadCacheDirectories}>
          <Feather name="refresh-cw" size={20} color={theme.colors.accent} />
        </Pressable>
      </View>

      {isLoading ? (
        <MyAppText>Loading cache directories...</MyAppText>
      ) : cacheDirectories.length === 0 ? (
        <MyAppText>No cache directories found</MyAppText>
      ) : (
        <View style={{ gap: 12, marginTop: 8 }}>
          {cacheDirectories.map((directory) => (
            <View
              key={directory.name}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
            >
              <View style={{ flex: 1 }}>
                <MyAppText weight="600">{directory.name}</MyAppText>
                <MyAppText size={12} style={{ opacity: 0.7 }}>
                  {formatBytes(directory.size)}
                </MyAppText>
              </View>
              <Pressable onPress={() => deleteCacheDirectory(directory)}>
                <Feather name="trash-2" size={20} color="#FF3B30" />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </OptionSection>
  );
}
