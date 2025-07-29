import { useEffect, useState } from "react";
import { VideoMetadata } from "../db/schema";
import { getVideosMetadtaByIds } from "../services/metadata";

export function useVideosMetadataById(videoIds: string[]) {
  const [metadataById, setMetadataById] = useState<Record<string, VideoMetadata>>();

  async function retrieveMetadatas() {
    const newMetadataByid = await getVideosMetadtaByIds(videoIds);
    setMetadataById(newMetadataByid);
  }

  useEffect(() => {
    retrieveMetadatas();
  }, [videoIds]);

  return {
    metadataById,
    refresh: retrieveMetadatas,
  };
}
