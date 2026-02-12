/**
 * app/(auth)/_layout.tsx
 * -----------------------
 * Layout del grupo de rutas de autenticacion.
 * Stack navigator sin header para pantallas limpias de login/registro.
 */

import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: '#FFFFFF' },
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
    </Stack>
  );
}
