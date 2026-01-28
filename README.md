# video-app-candidate-assessment
These are summarizes the key changes made to solve:

1) Add media to the timeline (Drag & Drop + Upload)
~ What was added

- **Upload button** support for selecting local files and appending them to the timeline.
- **Drag & drop support** for dropping local files onto the timeline.
- **File type enforcement**:
  - Allowed: **image**, **video**, **audio**
  - Unsupported types are rejected with a clear **toast error** message.
- **Video → video + audio clip creation**:
  - When a video contains an audio track, the app creates:
    - A **video clip** on the video track
    - A **matching audio clip** on the audio track
  - Both start at the **same timeline start time** and remain aligned.
  - If the video has **no audio**, only the video clip is created.
- **Append placement rules (alignment-safe)**:
  - Images/videos are appended after the last element in the **video/image** row.
  - Audio-only files are appended after the last element in the **audio** row.
  - When adding a video after images (or audio before video), start times are computed so that
    **video and its audio always start together** (gaps are inserted on the opposite track if needed).
- **Upload failure fallback**:
  - If server upload fails (e.g. auth/401), the UI falls back to using a **local blob URL** so the user can still add media.

### Where it lives

- **Upload & file ingestion orchestration**: `src/components/PlayerComponent/TimeLineControlPanel/TimeLineControlPanel.jsx`
  - Determines media category (image/video/audio)
  - Validates allowed types and shows errors for unsupported files
  - Calculates timeline start time for appends + sync rules (video/audio alignment)
  - Calls store methods to add media
- **Timeline DnD drop handling**: `src/components/Timeline/TimelineRow.jsx` and `src/components/Timeline/timeline-grid.jsx`
  - Accepts file drops on the timeline
  - Feeds the drop position into the same “add file to timeline” flow for consistent placement
- **Store media creation & Fabric canvas objects**: `src/mobx/store.js`
  - Creates editor elements (video/image/audio)
  - Creates Fabric objects for rendering
  - Handles video loading for blob URLs and avoids cache-busting on blob URLs
- **Canvas element refresh / reconstruction**: `src/mobx/store-modules/refreshElements.js`
  - Rebuilds Fabric objects from `editorElements` placement/state

----- Supported file types -------

- **Images**: any file where `file.type.startsWith('image/')`
- **Videos**: any file where `file.type.startsWith('video/')`
- **Audio**: any file where `file.type.startsWith('audio/')`

If the browser does not provide a MIME type for a file (rare), it is treated as unsupported and rejected.
-----------------------------------------------------------------------------------------------------------
3) Cut (Split) a timeline item

- What was added

- A **Cut/Split mode** that allows splitting a timeline item into two items at the current playhead time.
- The split preserves:
  - Element type (image/video/audio/etc.)
  - Row placement
  - Properties and rendering state
  - Non-overlapping contiguous time frames:
    - Left clip: `[start, cutTime]`
    - Right clip: `[cutTime, end]`

~ Where it lives

- **Timeline UI / cut mode toggling**: `src/components/Timeline/timeline-grid.jsx`
  - Tracks `isCutMode`
  - Enables the split interaction from the timeline UI
- **Split execution**: `src/mobx/store.js`
  - Produces two new timeline elements from the original one
  - Updates `editorElements` and triggers refresh + history save
