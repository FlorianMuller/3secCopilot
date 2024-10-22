# Database

## Retrieving videos metadata

### video-metadata table

Should store:
- if video is selected
- new video date if cheating
- video id (or url), to retreive it directly when creating final year video
- start and end time if video should be trimed
- if video is hidden

Columns
| Name             | Description                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `video_id`        | video unique url or id                                                                                                                          |
| `original_date`   | date of video in system                                                                                                                         |
| `assigned_to_date` | date if video assigned to new date (cheat)                                                                                                      |
| `is_selected`     | true if video should be included in final montage. In general, they should only be one selected video by day (but I think will not enforce it). |
| `start_time`        | start time (in milisecond) of the selected portion. (If null, should be video start) |
| `end_time`        | end time (in milisecond) of the selected portion. (If null, should be video end ?) |
| `is_hidden`       | true if video should not be shown in video list                                                                                                 |


### Algo

1. Get `videos` batch:
   
   Get videos from x to y

2. Get `videos` metadta:

    Get metadata (selected, hidden) for video with id in `videos`
    OR get metadata for videos with originalDate between x and y (better request BUT doesn't work if a video original date was changed in the os. As no metedata would be returned for this video, app would think no metdata was assigned to it)

3. Get video not from x to y BUT assigned to date from x to y:
    
    Get rows for video with assignedDate between x to y AND with id no in `videos` id (or keep assignedDate null for video assigned to original date, allowing to retrieve only video re assigne between x and y easily)

4. Merge metdata

5. Compute asyncly video thumnail, by starting by the more recent one

6. Group by date

7. Dislay check if selected, don't display if hidden

