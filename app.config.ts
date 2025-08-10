import { ExpoConfig, ConfigContext } from "expo/config";

type BuildMode = "dev" | "dogfood";

const getBuildMode = (): BuildMode => {
  const mode = process.env.EXPO_BUILD_MODE;
  return mode === "dev" || mode === "dogfood" ? mode : "dev";
};

const getConfigForBuildMode = (buildMode: BuildMode): ExpoConfig => {
  const baseConfig: ExpoConfig = {
    name: "3secs Copilot",
    slug: "3secs",
    scheme: "3secs",
    version: "1.0.0",
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
    extra: {
      eas: {
        projectId: "9c2f7031-bf09-4aca-bcab-b02914342ee7",
      },
    },
  };

  switch (buildMode) {
    case "dev":
      return {
        ...baseConfig,
        name: "3secs Copilot (Dev)",
        slug: "3secsDev",
        scheme: "3secsDev",
        version: "1.0.0-dev",
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
  const buildConfig = getConfigForBuildMode(buildMode);

  console.log(`🔧 Building in ${buildMode} mode(${buildConfig?.ios?.bundleIdentifier})`);

  return {
    ...config,
    ...buildConfig,
  };
};
