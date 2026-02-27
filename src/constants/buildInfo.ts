import Constants from "expo-constants";

interface BuildInfo {
  version: string;
  gitCommitHash: string;
  buildTimestamp: string;
  buildMode: "dev" | "dogfood";
}

export const buildInfo: BuildInfo = {
  version: Constants.expoConfig?.version ?? "unknown",
  gitCommitHash: Constants.expoConfig?.extra?.gitCommitHash ?? "dev",
  buildTimestamp: Constants.expoConfig?.extra?.buildTimestamp ?? new Date().toISOString(),
  buildMode: Constants.expoConfig?.extra?.buildMode ?? "dev",
};
