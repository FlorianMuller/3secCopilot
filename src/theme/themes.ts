import { DarkTheme, DefaultTheme, Theme } from "@react-navigation/native";
import { pSBC } from "../utils/pSBC";

export interface MyTheme extends Theme {
  colors: Theme["colors"] & {
    secondary: string;
    accent: string;
    textOnPrimary: string;
  };
  borderRadius: number;
}

// https://www.realtimecolors.com/?colors=f6f0ff-000000-bb8ff2-534a8e-1e47dc&fonts=Inter-Inter
const darkPrimary = "#bb8ff2";
const darkSecondary = "#534a8e";
const darkAccent = "#1e47dc";
const darkText = "#f6f0ff";
export const myDarkTheme: MyTheme = {
  ...DarkTheme,
  colors: {
    // ...DarkTheme.colors,
    background: "#000000",
    primary: darkPrimary,
    secondary: darkSecondary,
    accent: darkAccent,
    text: darkText,
    textOnPrimary: darkText,

    card: pSBC(-0.95, darkSecondary) || "red",
    border: "transparent",
    notification: darkAccent,
  },
  borderRadius: 10,
};

export const myLightTheme: MyTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,

    // todo: work on light
    secondary: DefaultTheme.colors.primary,
    accent: DefaultTheme.colors.primary,
    textOnPrimary: "white",
  },
  borderRadius: 10,
};
