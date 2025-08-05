# Contributing

## Database

The app uses `expo-sqlite` with Drizzle as an ORM to store data.

### Update

If you update the schemas defined in [schema.ts](src/db/schema.ts), the `make update-migration` command should be run to update the Drizzle migration file.r

### UI

[Drizzle studio expo](https://github.com/drizzle-team/drizzle-studio-expo) is also configured to allow you to view the databases tables in a nice web UI. To access it:

1. Run the application (`npm start`) and open it
2. In the terminal, press `shift + m`
3. Select "Open expo-drizzle-studio-plugin"

## Icons

We are using the [Expo icon library](https://icons.expo.fyi/).

## Updgrade Expo SDK version

If the Expo sdk used by the Expo Go app is updated, the Expo sdk used in this app should be updated to continue previewing it with the Expo Go app.

Follow the [Expo documentation on upgrading](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/). In general:

1. Upgrade expo sdk to last version
    ```shell
    npm install expo@latest
    ```

2. Update expo dependencies
    ```shell
    npx expo install --fix
    ```

## Build

### Expo developpment build

This app is using expo devlopment build to run the app on real devices and be able to use native modules (that don't work in Expo go).

To create the ios build:
```sh
make ios-build-dev
```

You can select a device with the `IOS_DEVICE` environment variable, or open the Xcode project with `make xcode-open-workspace` and select a device there.

### Dogfooding build

Create xcode project
```sh
make ios-build-df-xcode
```
Open it
```sh
make xcode-open-workspace
```

Create an archive with `Product > Archive`.
The archive (`.xcarchive`) will be in `~/Library/Developer/Xcode/Archives/<date>/...`

Then, transform the archive to an `.ipa` file:

```sh
scripts/xcarchiveToIpa.sh <path_to_xcarchive>
```

The ipa will be created on your desktop as `3secsCopilot.ipa`.
Just open it in the AltStore app on your iOS device to install it.
