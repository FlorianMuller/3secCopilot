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

### Sideload build

A sideload build produces an **unsigned** `.ipa`. It is signed on-device at install
time by SideStore/AltStore using your free Apple ID, so no paid Apple Developer account
is required and the build needs no signing secrets.

#### Automated (CI)

Pushing a version tag (`X.Y.Z`) triggers the [Sideload build workflow](.github/workflows/sideload-build.yml),
which builds the unsigned IPA on a GitHub macOS runner and publishes it as a GitHub Release.

```sh
git tag X.Y.Z
git push --tags
```

Once the run finishes, open the new release, download `3secsCopilot-X.Y.Z.ipa` on your
iOS device and open it in SideStore/AltStore to install.

> The tag becomes the app version (`CFBundleShortVersionString`), so use a numeric
> `X.Y.Z` tag. The workflow can also be run manually from the Actions tab
> (`workflow_dispatch`) against an existing tag.

##### SideStore/AltStore source (auto-updates)

To avoid downloading the IPA manually for every release, add the app **source** once
in SideStore/AltStore. The CI regenerates it from all GitHub Releases and publishes it
to GitHub Pages, so new versions show up as in-app updates:

```
https://florianmuller.github.io/3secCopilot/source.json
```

Open the [landing page](https://florianmuller.github.io/3secCopilot/) on your device for
one-tap "Add to SideStore / AltStore" buttons, or paste the URL above into the app's
*Sources → Add Source*. SideStore re-signs the unsigned IPA on-device with your free
Apple ID at install time.

> One-time repo setup: **Settings → Pages → Source → GitHub Actions** must be enabled
> so the `publish-source` job can deploy. The source is produced by
> [`scripts/generateAltSource.mjs`](scripts/generateAltSource.mjs).

#### Manual (local)

Create xcode project
```sh
make ios-build-sideload-xcode
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
