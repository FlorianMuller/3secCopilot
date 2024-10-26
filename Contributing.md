# Contributing

## Database

The app uses `expo-sqlite` with Drizzle as an ORM to store data.

[Drizzle studio expo](https://github.com/drizzle-team/drizzle-studio-expo) is also configured to allow you to view the databases tables in a nice web UI. To access it:

1. Run the application (`npm start`) and open it
2. In the terminal, press `shift + m`
3. Select "Open expo-drizzle-studio-plugin"

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
