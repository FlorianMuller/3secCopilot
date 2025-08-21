# 3sec Copilot - Developer Documentation

## Project Overview

3sec Copilot is a React Native mobile application built with Expo that helps users create video montages by selecting and trimming videos from their camera roll. The app allows users to select one video per day to create a "3-second" daily video compilation.

## Tech Stack

- **Framework**: React Native with Expo SDK 53
- **Language**: TypeScript with strict mode
- **Navigation**: React Navigation v6 (Bottom Tabs + Native Stack)
- **Database**: SQLite with Drizzle ORM
- **Animations**: React Native Reanimated v3 + Gesture Handler
- **Video**: Expo Video with thumbnail generation
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
    │   └── Options/       # Settings and preferences
    ├── hooks/             # Custom React hooks
    ├── navigation/        # Navigation configuration
    ├── services/          # Business logic layer
    │   ├── preferences.ts # User preferences management
    │   ├── selection.ts   # Video selection logic
    │   └── dayShift.ts    # Day shifting functionality
    ├── theme/             # Theming system (light/dark modes)
    └── utils/             # Utility functions
```

### Key Features

1. **Video Management**: Browse camera roll videos organized by date
2. **Video Selection**: Select one video per day for the montage
3. **Video Trimming**: Set start/end times for selected portions
4. **Day Shifting**: Assign videos to different dates
5. **Preferences**: User settings with database persistence
6. **Theming**: Light/dark mode support with custom color schemes

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
├── Preview Tab (Placeholder for montage preview)
└── Settings Tab (OptionsNavigation)
    └── Options (Settings and preferences)
```

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