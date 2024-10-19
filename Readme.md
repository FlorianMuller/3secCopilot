# 3sec Copitlot

## Quick start

Prequiste: node (`nvm install node`)

```shell
npm install
npm start
```

then scan the QR code with phone to see a preview of the app in the Expo Go app.

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