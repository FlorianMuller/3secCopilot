import { DarkTheme, DefaultTheme, Theme } from "@react-navigation/native";
import { pSBC } from "../utils/pSBC";

export interface MyTheme extends Theme {
  colors: Theme["colors"] & {
    secondary: string;
    accent: string;
    textOnPrimary: string;
    textOnSecondary: string;
    textOnAccent: string;
  };
  borderRadius: number;
}

// https://www.realtimecolors.com/?colors=f6f0ff-000000-bb8ff2-534a8e-1e47dc&fonts=Inter-Inter
// https://www.realtimecolors.com/?colors=f6f0ff-000000-ba8cf2-534a8c-6fcaff&fonts=Inter-Inter
const darkPrimary = "rgb(188, 143, 242)";
const darkSecondary = "rgb(83, 74, 142)";
const darkAccent = "rgb(111, 202, 255)";
const darkText = "rgb(246, 240, 255)";

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
    textOnSecondary: darkText,
    textOnAccent: darkText,

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
    textOnSecondary: "white",
    textOnAccent: "white",
  },
  borderRadius: 10,
};
