import { View, Text, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withTiming,
  useSharedValue,
  withSequence,
  withDelay,
  runOnJS,
} from 'react-native-reanimated';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/src/contexts/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react-native';

export function OfflineBanner() {
  const { isOnline, isAuthenticated, syncSession } = useAuth();
  const insets = useSafeAreaInsets();

  const translateY = useSharedValue(-100);
  const opacity = useSharedValue(0);
  const [isVisible, setIsVisible] = useState(false);

  const wasOnlineRef = useRef(isOnline);

  useEffect(() => {
    const justWentOffline = wasOnlineRef.current && !isOnline && isAuthenticated;
    wasOnlineRef.current = isOnline;

    if (justWentOffline) {
      setIsVisible(true);
      
      const hideCallback = () => {
        'worklet';
        runOnJS(setIsVisible)(false);
      };

      // Entra, espera 3s, sale
      translateY.value = withSequence(
        withTiming(0, { duration: 300 }),
        withDelay(3000, withTiming(-100, { duration: 300 }))
      );
      opacity.value = withSequence(
        withTiming(1, { duration: 300 }),
        withDelay(3000, withTiming(0, { duration: 300 }, hideCallback))
      );
    }
  }, [isOnline, isAuthenticated]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!isVisible && isOnline) return null;

  // Si está permanentemente offline, quizás quieras dejar un banner fijo pequeño,
  // pero por ahora usaremos el comportamiento "toast" del original.
  if (!isVisible) return null;

  return (
    <Animated.View
      style={[
        animatedStyle,
        {
          position: 'absolute',
          top: insets.top,
          left: 0,
          right: 0,
          zIndex: 9999,
          alignItems: 'center',
        },
      ]}>
      <View className="flex-row items-center rounded-full bg-amber-500 px-4 py-2 shadow-md">
        <WifiOff size={16} color="white" />
        <Text className="ml-2 font-medium text-white">Modo sin conexión</Text>
      </View>
    </Animated.View>
  );
}

export function ReconnectedBanner() {
  const { isOnline, isAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(-100);
  const [show, setShow] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (isAuthenticated && !isOnline) {
        wasOffline.current = true;
    }
    
    if (isAuthenticated && isOnline && wasOffline.current) {
        setShow(true);
        wasOffline.current = false;
        translateY.value = withSequence(
            withTiming(0, { duration: 300 }),
            withDelay(2000, withTiming(-100, { duration: 300 }, () => runOnJS(setShow)(false)))
        );
    }
  }, [isOnline, isAuthenticated]);

  if (!show) return null;

  return (
     <Animated.View
      style={[
        useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] })),
        { position: 'absolute', top: insets.top, left: 0, right: 0, zIndex: 9999, alignItems: 'center' },
      ]}>
      <View className="flex-row items-center rounded-full bg-green-600 px-4 py-2 shadow-md">
        <Wifi size={16} color="white" />
        <Text className="ml-2 font-medium text-white">Conexión restaurada</Text>
      </View>
    </Animated.View>
  );
}