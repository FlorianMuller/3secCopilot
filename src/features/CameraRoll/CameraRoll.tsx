import React, { useState, useEffect, useMemo } from "react";
import { StyleSheet, Text, View, Image, ScrollView } from "react-native";
import * as MediaLibrary from "expo-media-library";
import * as VideoThumbnails from "expo-video-thumbnails";
import { Video, AVPlaybackStatus } from "expo-av";
import { useWindowDimensions } from "react-native";
import { MyAppText } from "../../components/text/MyAppText";
import { SubTitle } from "../../components/text/SubTitle";
import { VidThumbnail } from "./VideoThumbnail";
import { groupBy } from "../../utils/groupBy";

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

export interface PhoneMedia extends MediaLibrary.Asset {
  info?: MediaLibrary.AssetInfo;
  thumbnail?: VideoThumbnails.VideoThumbnailsResult;
}

export default function CameraRoll() {
  const [status, requestPermission] = MediaLibrary.usePermissions();

  const [vids, setVids] = useState<PhoneMedia[]>([]);

  const getVid = async () => {
    await requestPermission();

    const vidPage: MediaLibrary.PagedInfo<PhoneMedia> = await MediaLibrary.getAssetsAsync({
      mediaType: "video",
      sortBy: "creationTime",
      // createdAfter: new Date(),
      // createdBefore: new Date(),
      first: 200,
    });

    setVids(vidPage.assets);
  };

  useEffect(() => {
    getVid();
  }, []);

  function getGroupedVideos(vids: PhoneMedia[]) {
    const grouped = groupBy(vids, (v) => new Date(v.creationTime).toDateString());
    const dateKey: [Date, PhoneMedia[]][] = Object.entries(grouped).map(([date, vids]) => [new Date(date), vids]);
    const sorted = dateKey.sort(([date1, _], [date2, __]) => date2.getTime() - date1.getTime());
    return sorted;
  }

  const groupedVideos = useMemo(() => getGroupedVideos(vids), [vids]);

  return (
    <ScrollView>
      <View style={styles.container}>
        {/* <SubTitle>Je t'aime Léa</SubTitle> */}

        {groupedVideos.map(([date, vids]) => (
          <View>
            <SubTitle>{date.toLocaleDateString()}</SubTitle>
            <View style={styles.thumbnailList}>
              {vids.map((vid) => (
                <VidThumbnail video={vid} key={vid.id} />
              ))}
            </View>
          </View>
        ))}

        {/* <View style={styles.thumbnailList}>
          {vids.map((vid) => (
            <VidThumbnail video={vid} key={vid.id} />
          ))}
        </View> */}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  video: {
    // alignSelf: 'center',
    width: 320,
    height: 200,
  },
  container: {
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
