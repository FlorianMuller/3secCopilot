import { StyleSheet, Text } from 'react-native';

export function MyAppText({ children }) {
  return <Text style={styles.defaultText}>{children}</Text>
}

const styles = StyleSheet.create({
  defaultText: {
    color: "white"
  }
});

