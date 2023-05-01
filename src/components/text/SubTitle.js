import { Text, StyleSheet } from "react-native";
import { MyAppText } from "./MyAppText";

export function SubTitle({ children }) {
    return <MyAppText>
        <Text style={styles.subTitle}>
            {children}
        </Text>
    </MyAppText>
}

const styles = StyleSheet.create({
    subTitle: {
        fontSize: 23
    }
});