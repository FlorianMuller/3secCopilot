import { MyTheme } from "./themes";

// Change the type returned by `useTheme`
declare module "@react-navigation/native" {
  export function useTheme(): MyTheme;
}
