import '@/global.css';

import { AuthProvider, useAuth } from '@/src/contexts/AuthContext';
import { NAV_THEME } from '@/src/lib/theme';
import { ThemeProvider } from '@react-navigation/native';
import { PortalHost } from '@rn-primitives/portal';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { cssInterop, useColorScheme } from 'nativewind';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { SplashScreenController } from '../components/ui/splash';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DatabaseProvider } from '../contexts/database-provider';
import { SyncManager } from '../components/sync-manager';
import { ConnectivityProvider } from '../contexts/connectivity-context';
import { OfflineBanner, ReconnectedBanner } from '../components/offline-banner';
import { LinearGradient } from 'expo-linear-gradient';

// Hacer que GestureHandlerRootView soporte className de NativeWind
cssInterop(GestureHandlerRootView, { className: 'style' });

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const queryClient = new QueryClient();

export default function RootLayout() {
  const { colorScheme } = useColorScheme();

  return (
    <GestureHandlerRootView className="flex-1 bg-background">
      {/* Theme Provider */}
      <ThemeProvider value={NAV_THEME[colorScheme ?? 'light']}>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        <LinearGradient
          key={colorScheme}
          colors={colorScheme === 'dark' ? ['#FE9E2A33', '#121212'] : ['#FE9E2A33', '#D6D6D6']}
          locations={[0, 0.32]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{ position: 'absolute', inset: 0 }}
        />

        {/* Providers */}
        <SafeAreaProvider>
          <KeyboardProvider>
            <BottomSheetModalProvider>
              <DatabaseProvider>
                <ConnectivityProvider>
                  <QueryClientProvider client={queryClient}>
                    <AuthProvider>
                      <SplashScreenController />
                      <SyncManager />
                      <OfflineBanner />
                      <ReconnectedBanner />
                      <RootNavigator />
                      <PortalHost />
                    </AuthProvider>
                  </QueryClientProvider>
                </ConnectivityProvider>
              </DatabaseProvider>
            </BottomSheetModalProvider>
          </KeyboardProvider>
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

  // Solo mostrar null durante la carga INICIAL (cuando isInitialized es false)
  // Una vez inicializado, NUNCA devolver null para evitar desmontar rutas
  // durante operaciones de auth (registro, login, etc.)
  if (isLoading) {
    return null;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
        animation: 'fade',
      }}>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(settings)" />
        <Stack.Screen name="complete-profile" />
      </Stack.Protected>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}
