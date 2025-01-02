import * as MediaLibrary from "expo-media-library";

export function getLocalUri(info: MediaLibrary.AssetInfo): string | undefined {
  // Normally this should work:
  // return info.localUri;

  // But since ios 18, the app sometimes doesn't have the right to read
  // the path returned by `.localUri`, see :
  // - https://github.com/expo/expo/issues/31857
  // - https://github.com/expo/expo/issues/31620

  // This fix was suggested on github: https://github.com/expo/expo/issues/31857#issuecomment-2511591063
  // I don't understand it but it works:
  const uriId = info.uri.substring(5, 41);
  return `assets-library://asset/asset.mp4?id=${uriId}&ext=mp4`;
}
