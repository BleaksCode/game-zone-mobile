/**
 * lib/auth-client.ts
 * --------------------
 * Cliente de Better-Auth para React Native (Expo).
 *
 * Este módulo se importa en el lado del cliente (componentes, hooks).
 * Se comunica con las API Routes de Better-Auth vía HTTP.
 */

import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';

// ---------------------------------------------------------------------------
// Almacenamiento seguro de tokens (expo-secure-store)
// ---------------------------------------------------------------------------

/**
 * Almacenamiento de cookies/tokens usando expo-secure-store.
 * Reemplaza el almacenamiento por defecto (cookies del navegador)
 * por almacenamiento seguro nativo en el dispositivo.
 */
const secureStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      console.warn('[AuthClient] Failed to store item:', key);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      console.warn('[AuthClient] Failed to remove item:', key);
    }
  },
};

// ---------------------------------------------------------------------------
// Cliente de autenticación
// ---------------------------------------------------------------------------

/**
 * Cliente Better-Auth configurado para Expo.
 *
 * Requiere la variable de entorno:
 *   - EXPO_PUBLIC_API_URL: URL base del servidor API (ej: https://tu-app.vercel.app)
 *
 * Uso:
 * ```tsx
 * import { authClient } from '@/lib/auth-client';
 *
 * // Sign up
 * await authClient.signUp.email({ email, password, name });
 *
 * // Sign in
 * await authClient.signIn.email({ email, password });
 *
 * // Get session
 * const session = await authClient.getSession();
 *
 * // Sign out
 * await authClient.signOut();
 * ```
 */
export const authClient = createAuthClient({
  baseURL: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8081',
  storage: secureStorage,
});

// ---------------------------------------------------------------------------
// Helpers para la integración con Sync Engine
// ---------------------------------------------------------------------------

/**
 * Obtiene el token de sesión actual para autenticar peticiones de sync.
 * Usado por createSyncEngine({ getSessionToken }).
 */
export async function getSessionToken(): Promise<string | null> {
  const session = await authClient.getSession();
  if (!session?.data?.session?.token) return null;
  return session.data.session.token;
}

/**
 * Obtiene el ID del usuario autenticado actual.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await authClient.getSession();
  if (!session?.data?.user?.id) return null;
  return session.data.user.id;
}
