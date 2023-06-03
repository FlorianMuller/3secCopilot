import React, { useState, useEffect } from "react";
import { StyleSheet, Text, View, Image } from "react-native";
import * as MediaLibrary from "expo-media-library";
import * as VideoThumbnails from "expo-video-thumbnails";
import { Video, AVPlaybackStatus } from "expo-av";
import { useWindowDimensions } from "react-native";
import { MyAppText } from "../../components/text/MyAppText";
import { SubTitle } from "../../components/text/SubTitle";

function VidThumbnail({ vid }) {
  const { height, width } = useWindowDimensions();
  const thumbnailSize = width / 5;

  return (
    <View style={{ height: thumbnailSize, width: thumbnailSize, padding: 1 }}>
      <Image source={{ uri: vid.thumbnail.uri }} style={{ height: "100%", width: "100%" }} key={vid.id} />
    </View>
  );
}

// export function DaySection({ vids }) {
//   const day = vids[0].creationTime;
//   return (
//     <View>
//       <SubTitle>Vendredi 12 mars</SubTitle>
//       {vids.map(vid =>
//       )}
//     </View>
//   );
// }

interface PhoneMedia extends MediaLibrary.Asset {
  info?: MediaLibrary.AssetInfo;
  thumbnail?: VideoThumbnails.VideoThumbnailsResult;
}

export default function CameraRoll() {
  const [status, requestPermission] = MediaLibrary.usePermissions();
  const [vids, setVids] = useState<PhoneMedia[]>([]);
  const video = React.useRef(null);

  const getVid = async () => {
    await requestPermission();

    const vidPage: MediaLibrary.PagedInfo<PhoneMedia> = await MediaLibrary.getAssetsAsync({
      mediaType: "video",
      sortBy: "creationTime",
      // createdAfter: new Date(),
      // createdBefore: new Date(),
      first: 20,
    });

    for (const vid of vidPage.assets) {
      // console.log(vid.uri);
      try {
        vid.info = await MediaLibrary.getAssetInfoAsync(vid.id);
        vid.thumbnail = await VideoThumbnails.getThumbnailAsync(vid.info.localUri || "");
      } catch (e) {
        console.error(e);
      }
    }
    setVids(vidPage.assets);
    // console.log(vidPage.assets);
  };

  useEffect(() => {
    getVid();
  }, []);

  return (
    <View style={styles.container}>
      {/* {vids.length > 0 && <Video
        ref={video}
        style={styles.video}
        source={{ uri: vids[0].info.localUri}}
        useNativeControls
        resizeMode="contain"
      />} */}

      <SubTitle>Je t'aime Léa</SubTitle>
      <View style={styles.thumbnailList}>
        {vids.map((vid) => (
          <VidThumbnail vid={vid} key={vid.id} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  video: {
    // alignSelf: 'center',
    width: 320,
    height: 200,
  },
  container: {
    overflow: "scroll",
    // margin: 20,
    marginTop: 60,
  },
  thumbnailList: {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  VideoThumbnails: {
    width: 90,
    height: 90,
  },
});
