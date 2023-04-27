import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import CameraRoll from './src/components/CameraRoll/CameraRoll';

export default function App() {

  return (
    <CameraRoll></CameraRoll>
  );
}

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: "black",
//     alignItems: 'center',
//     justifyContent: 'center',
//   },
//   text: {
//     color: "red"
//   },
// });
