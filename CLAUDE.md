# 3sec Copilot - Developer Documentation

## Project Overview

3sec Copilot is a React Native mobile application built with Expo that helps users create video montages by selecting and trimming videos from their camera roll. The app allows users to select one video per day to create a "3-second" daily video compilation, and export a chosen period (year) as a single shareable montage video.

## Tech Stack

- **Framework**: React Native with Expo SDK 53
- **Language**: TypeScript with strict mode
- **Navigation**: React Navigation v6 (Bottom Tabs + Native Stack)
- **Database**: SQLite with Drizzle ORM
- **Animations**: React Native Reanimated v3 + Gesture Handler
- **Video**: Expo Video with thumbnail generation
- **Export**: Local Expo native module (Swift, AVFoundation) in `modules/expo-montage/`
- **Styling**: React Native StyleSheet with custom theming
- **State Management**: React hooks with custom preference system

## Architecture

### Project Structure

```
/
├── App.tsx                 # Main app entry with tab navigation
├── AppLayout.tsx          # Root layout wrapper
├── app.json               # Expo configuration
├── drizzle.config.ts      # Database ORM configuration
├── Makefile               # Development commands
├── modules/
│   └── expo-montage/      # Local Expo module: native montage export (Swift/AVFoundation)
│       ├── ios/           # Encode pipeline, overlays, click sound resource
│       └── src/           # TS API (exportMontage, analyzeClips, cancelExport, events)
└── src/
    ├── components/        # Reusable UI components
    │   ├── MyTabBar.tsx   # Custom floating tab bar
    │   ├── text/          # Text components with theming
    │   └── ...
    ├── db/                # Database layer
    │   ├── db.ts          # Database connection
    │   └── schema.ts      # Drizzle schemas
    ├── features/          # Feature-based components
    │   ├── CameraRoll/    # Video browsing and selection
    │   ├── Export/        # Period list + export screen (stats, options, preview, export)
    │   └── Options/       # Settings and preferences
    ├── hooks/             # Custom React hooks
    ├── navigation/        # Navigation configuration
    ├── services/          # Business logic layer
    │   ├── preferences.ts # User preferences management
    │   ├── selection.ts   # Video selection logic
    │   ├── dayShift.ts    # Day shifting functionality
    │   └── montage.ts     # Export orchestration (timeline build, quality combos, size estimate)
    ├── theme/             # Theming system (light/dark modes)
    └── utils/             # Utility functions
```

### Key Features

1. **Video Management**: Browse camera roll videos organized by date
2. **Video Selection**: Select one video per day for the montage
3. **Video Trimming**: Set start/end times for selected portions
4. **Day Shifting**: Assign videos to different dates
5. **Montage Export**: Render a period's selected clips into one video (opening title card, missing-day beats with click sound, date/hour/title overlays, quality picker, inline preview, save/share)
6. **Preferences**: User settings with database persistence
7. **Theming**: Light/dark mode support with custom color schemes

### Database Schema

The app uses SQLite with Drizzle ORM for local data storage:

#### `videos_metadata` table
- `video_id` (Primary Key): Unique video identifier
- `video_original_date`: Original video creation date
- `assigned_to_date`: Manually assigned date (for day shifting)
- `is_selected`: Whether video is selected for montage
- `trim_start_time`/`trim_end_time`: Trimming boundaries in milliseconds
- `is_hidden`: Whether video should be hidden from UI

#### `preferences` table
- `key`/`value`: Key-value store for user preferences

### Navigation Structure

```
Tab Navigator (Bottom Tabs with Custom Floating Bar)
├── Videos Tab (CameraRollNavigation)
│   ├── CameraRoll (Main video list)
│   └── VideoPlayer (Video playback with controls)
├── Export Tab (ExportNavigation)
│   ├── PeriodList (One row per period with ≥1 selected video)
│   └── ExportScreen (Stats + options + preview + export for one period)
└── Settings Tab (OptionsNavigation)
    └── Options (Settings and preferences)
```

### Export Feature (v1 complete)

The export pipeline turns a period's selected & trimmed clips into a single `.mp4` montage. Full spec and current status: `doc/export-spec.md`; remaining on-device verification items: `doc/export-device-checklist.md`; native implementation guide: `doc/expo-montage-field-guide.html`.

- **Source of truth is metadata**: export reads original camera-roll assets (`PHAsset` by `video_id`) and applies `trim_start_time`/`trim_end_time` during composition — files under `trimmedVideos/` are a playback cache only, never an export input.
- **Native side** (`modules/expo-montage/`, Swift): chunked `AVAssetReader`+`AVAssetWriter` pipeline (~monthly chunks, then passthrough-video / continuous-audio assemble), CoreImage overlays, H.264 High + AAC output, progress events, cancellation, per-asset degradation to black beats. Frame reordering (B-frames) is deliberately disabled — required for the passthrough chunk concat.
- **JS side**: `src/services/montage.ts` builds the day timeline (opening card, one beat per missing day), formats overlay strings (luxon, device locale), owns the bitrate table and size estimate, and computes quality combos from `analyzeClips` results. Export options are ordinary preferences (`export*` keys in `preferences.ts`), only surfaced on the ExportScreen.
- **Preview** renders through the same pipeline at 640×360 into `cacheDirectory/exports-preview/`; full exports go to `documentDirectory/exports/<periodId>-<timestamp>.mp4` (visible in the Files app, never overwritten).
- **Iteration**: JS hot-reloads via Metro; Swift rebuilds fastest from Xcode (`make xcode-open-workspace`); compile-check the module without a device via `xcodebuild -project ios/Pods/Pods.xcodeproj -target ExpoMontage -sdk iphonesimulator build`.
- **Dev hooks** (`__DEV__`-gated, set as env vars on `expo run:ios`): `EXPO_PUBLIC_AUTOSEED`, `EXPO_PUBLIC_INITIAL_TAB`, `EXPO_PUBLIC_AUTO_OPEN_PERIOD`, `EXPO_PUBLIC_AUTO_EXPORT`, `EXPO_PUBLIC_AUTO_PREVIEW`, `EXPO_PUBLIC_AUTO_QUALITY`, `EXPO_PUBLIC_AUTO_CANCEL_MS` — used to drive export flows headlessly on the seeded `verify-iphone` simulator (see spec §0 for the full recipe).

## Development Workflow

### Common Commands

#### Development
```bash
# Start development server
npm start
# or
make run
```

#### Database Management
```bash
# Update database migrations after schema changes
make update-migration
# or
npx drizzle-kit generate
```

### Configuration Files

- `app.json`: Expo app configuration, permissions, and platform settings
- `babel.config.js`: Babel configuration for Drizzle SQL imports and Reanimated
- `metro.config.js`: Metro bundler config for SQL files and Reanimated
- `tsconfig.json`: TypeScript configuration (extends Expo base)
- `drizzle.config.ts`: Database ORM configuration

### Key Development Notes

1. **Database Migrations**: Always run `make update-migration` after changing schemas in `src/db/schema.ts`
2. **Permissions**: App requires media library permissions for camera roll access
3. **Performance**: Uses thumbnail caching and lazy loading for video lists
4. **Gesture Handling**: Implemented for video controls and UI interactions
5. **Theming**: Automatic light/dark mode based on system preferences

### Architecture Patterns

1. **Feature-Based Organization**: Components organized by feature rather than type
2. **Service Layer**: Business logic separated from UI components
3. **Custom Hooks**: Reusable state management with database integration
4. **Preference System**: Type-safe user preference management with database persistence
5. **Theme System**: Centralized theming with light/dark mode support

### Code Quality

- TypeScript with strict mode enabled
- Prettier configured for code formatting
- Consistent file naming and component structure
- Clear separation of concerns between UI, business logic, and data layers

- When error handling in helper / reusable functions, do not catch the errors, let the caller do it