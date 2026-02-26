import { ExpoConfig, ConfigContext } from "expo/config";
import { execSync } from "child_process";

type BuildMode = "dev" | "dogfood";

const getBuildMode = (): BuildMode => {
  const mode = process.env.EXPO_BUILD_MODE;
  return mode === "dev" || mode === "dogfood" ? mode : "dev";
};

const getGitTag = (required: boolean): string => {
  try {
    return execSync("git describe --tags --exact-match HEAD").toString().trim();
  } catch {
    if (required) {
      throw new Error(
        "Build failed: no git tag found on the current commit. Tag the commit before building in dogfood mode."
      );
    }
    return "dev";
  }
};

const getBuildMetadata = (version: string) => {
  let gitCommitHash = "unknown";
  try {
    gitCommitHash = execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    // Fallback for non-git environments
  }

  return {
    gitCommitHash,
    buildTimestamp: new Date().toISOString(),
    buildMode: getBuildMode(),
    version,
  };
};

const getConfigForBuildMode = (buildMode: BuildMode, version: string): ExpoConfig => {
  const baseConfig: ExpoConfig = {
    name: "3secs Copilot",
    slug: "3secs",
    version,
    orientation: "portrait" as const,
    icon: "./assets/icon.png",
    newArchEnabled: true,
    userInterfaceStyle: "automatic" as const,
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain" as const,
      backgroundColor: "#ffffff",
    },
    updates: {
      fallbackToCacheTimeout: 0,
    },
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: true,
      userInterfaceStyle: "automatic" as const,
      bundleIdentifier: "com.fmuller.3secs",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        UIFileSharingEnabled: true,
        LSSupportsOpeningDocumentsInPlace: true,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#FFFFFF",
      },
      userInterfaceStyle: "automatic" as const,
      permissions: [
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.ACCESS_MEDIA_LOCATION",
      ],
      package: "com.fmuller.x3secs",
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    plugins: [
      [
        "expo-media-library",
        {
          photosPermission: "Allow $(PRODUCT_NAME) to access your photos.",
          savePhotosPermission: "Allow $(PRODUCT_NAME) to save photos.",
          isAccessMediaLocationEnabled: true,
        },
      ],
      "expo-video",
      "expo-sqlite",
    ],
    extra: getBuildMetadata(version),
  };

  switch (buildMode) {
    case "dev":
      return {
        ...baseConfig,
        name: "3secs Copilot (Dev)",
        slug: "3secsDev",
        ios: {
          ...baseConfig.ios,
          bundleIdentifier: "com.fmuller.3secsDev",
        },
      };

    case "dogfood":
      return {
        ...baseConfig,
      };

    default:
      return baseConfig;
  }
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const buildMode = getBuildMode();
  const version = getGitTag(buildMode === "dogfood");
  const buildConfig = getConfigForBuildMode(buildMode, version);

  console.log(`🔧 Building in ${buildMode} mode(${buildConfig?.ios?.bundleIdentifier})`);

  return {
    ...config,
    ...buildConfig,
  };
};
