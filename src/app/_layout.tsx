import "@/global.css";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { PortalHost } from "@rn-primitives/portal";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { useColorScheme } from "nativewind";

// Importaciones de Contextos
import { ConnectivityProvider } from "@/src/contexts/connectivity-context";
import { DatabaseProvider } from "@/src/contexts/database-provider";
import { AuthProvider, useAuth } from "@/src/contexts/AuthContext";

// Componentes de Utilidad
import { OfflineBanner, ReconnectedBanner } from "@/src/components/offline-banner";
import { SyncManager } from "@/src/components/sync-manager";

// Componente RootNavigator que decide qué mostrar basado en la autenticación
function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

  // Durante la carga inicial (lectura de SecureStore), no mostramos nada
  // para evitar parpadeos o redirecciones erróneas.
  if (isLoading) {
    return null;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "transparent" },
        animation: "fade",
      }}
    >
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="index" />
      </Stack.Protected>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const { colorScheme } = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
        <SafeAreaProvider>
          <KeyboardProvider>
            <ConnectivityProvider>
              <DatabaseProvider>
                <AuthProvider>
                  {/* Componentes lógicos y visuales globales */}
                  <SyncManager />
                  <OfflineBanner />
                  <ReconnectedBanner />

                  {/* Navegación Principal */}
                  <RootNavigator />

                  <PortalHost />
                </AuthProvider>
              </DatabaseProvider>
            </ConnectivityProvider>
          </KeyboardProvider>
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}