import { useNavigation } from '@react-navigation/native';
import { useEffect } from 'react';

export const useNavigationFocus = (onFocus?: () => void, onBlur?: () => void) => {
  const navigation = useNavigation();

  useEffect(() => {
    const unsubscribeFocus = onFocus ? navigation.addListener('focus', onFocus) : undefined;
    const unsubscribeBlur = onBlur ? navigation.addListener('blur', onBlur) : undefined;

    return () => {
      unsubscribeFocus?.();
      unsubscribeBlur?.();
    };
  }, [navigation, onFocus, onBlur]);
};