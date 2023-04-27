import React, { useState, useEffect } from "react";
import { StyleSheet, Text, View, Image } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Video, AVPlaybackStatus } from 'expo-av';

// function VidThumbnail(vid) {
//   return (

//   );
// }

export default function CameraRoll() {
  const [status, requestPermission] = MediaLibrary.usePermissions();
  const [vids, setVids] = useState([]);
  const video = React.useRef(null);

  const getVid = async () => {
    await requestPermission();

    const vidPage = await MediaLibrary.getAssetsAsync({
      mediaType: "video",
      sortBy: "creationTime",
      // createdAfter: new Date(),
      // createdBefore: new Date(),
      first: 10
    });

    for (const vid of vidPage.assets) {
      // console.log(vid.uri);
      try {
        vid.info = await MediaLibrary.getAssetInfoAsync(vid.id);
        // console.log(vid.info);
        vid.thumbnail = await VideoThumbnails.getThumbnailAsync(vid.info.localUri);
        // console.log(vid.thumbnail);
      } catch (e) {
        console.error(e);
      }
    }
    setVids(vidPage.assets);
    // console.log(vidPage.assets);
  }

  useEffect(() => {
    getVid();
  }, [])

  return (
    <View style={styles.container}>
      {/* {vids.length > 0 && <Video
        ref={video}
        style={styles.video}
        source={{ uri: vids[0].info.localUri}}
        useNativeControls
        resizeMode="contain"
      />} */}
      {/* {vids.length > 0 && <Text>{vids[0].info.localUri}</Text>} */}
      <Text>Ouaaai</Text>
      <View style={styles.thumbnailList}>
        {vids.map((vid) => (
          <>
            {vid.thumbnail && (
              <Image
                source={{ uri: vid.thumbnail.uri }}
                style={styles.VideoThumbnails}
                key={vid.id}
              />
            )}
          </>
        ))}
      </View>
    </View>
  );
}
// uri: 'https://d23dyxeqlo5psv.cloudfront.net/big_buck_bunny.mp4',

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
    justifyContent: "center"
  },
  VideoThumbnails: {
    width: 90,
    height: 90,
  }
});

// const styles = StyleSheet.create({
// });