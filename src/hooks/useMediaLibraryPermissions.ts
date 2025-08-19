import * as MediaLibrary from "expo-media-library";
import { useCallback } from "react";

export interface UseMediaLibraryPermissionsReturn {
  permissionResponse: MediaLibrary.PermissionResponse | null;
  requestPermission: () => Promise<MediaLibrary.PermissionResponse>;
  ensurePermission: () => Promise<boolean>;
}

export function useMediaLibraryPermissions(): UseMediaLibraryPermissionsReturn {
  const [permissionResponse, requestPermission] = MediaLibrary.usePermissions();

  const ensurePermission = useCallback(async (): Promise<boolean> => {
    if (permissionResponse?.status === "granted") {
      return true;
    }

    try {
      const newPermission = await requestPermission();
      return newPermission.status === "granted";
    } catch (error) {
      console.error("Error while requesting media library permission:", error);
      return false;
    }
  }, [permissionResponse, requestPermission]);

  return {
    permissionResponse,
    requestPermission,
    ensurePermission,
  };
}