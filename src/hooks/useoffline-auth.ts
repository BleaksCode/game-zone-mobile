/**
 * hooks/use-offline-auth.ts
 * ---------------------------
 * Hook principal de autenticacion local-first para GameZone.
 * Integra validacion de red via ConnectivityContext.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import { authClient, signIn, useSession } from '@/src/lib/auth-client';
import { eq } from 'drizzle-orm';
import { useConnectivity } from '@/src/contexts/connectivity-context';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const CACHED_USER_KEY = 'gamezone_cached_user';
const CACHED_SESSION_KEY = 'gamezone_cached_session';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface CachedUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  username?: string;
  emailVerified?: boolean;
}

interface CachedSession {
  user: CachedUser;
  cachedAt: number;
}

// ---------------------------------------------------------------------------
// Helpers: SQLite & SecureStore
// ---------------------------------------------------------------------------

// function getLocalDbSafe() {
//   try {
//     // Importamos del cliente que AHORA es solo local
//     // Asegúrate de que client.ts esté configurado con 'app-db.db'
//     const { getLocalDb } = require('@/src/db/client');
//     const db = getLocalDb();
//     if (!db) return null;
//     const schema = require('@/src/db/schema');
//     return { db, schema };
//   } catch {
//     return null;
//   }
// }

// async function ensureLocalTables() {
//   try {
//     // eslint-disable-next-line @typescript-eslint/no-require-imports
//     const { initLocalDatabase } = require('@/src/db/client');
//     await initLocalDatabase();
//   } catch (e) {
//     console.warn('[useOfflineAuth] Error inicializando tablas locales:', e);
//   }
// }

// async function upsertLocalUser(userData: CachedUser) {
//   const local = getLocalDbSafe();
//   if (!local) return;
//   const { db, schema } = local;
//   try {
//     const existing = await db.select().from(schema.users).where(eq(schema.users.id, userData.id)).limit(1);
//     if (existing.length > 0) {
//       await db.update(schema.users).set({
//         name: userData.name, email: userData.email, image: userData.image ?? null,
//         emailVerified: userData.emailVerified ?? false, updatedAt: new Date().toISOString(),
//       }).where(eq(schema.users.id, userData.id));
//     } else {
//       await db.insert(schema.users).values({
//         id: userData.id, name: userData.name, email: userData.email, image: userData.image ?? null,
//         emailVerified: userData.emailVerified ?? false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
//       });
//     }
//   } catch (e) { console.warn('[useOfflineAuth] Error upserting local user:', e); }
// }

// async function getLocalUser(userId: string): Promise<CachedUser | null> {
//   const local = getLocalDbSafe();
//   if (!local) return null;
//   const { db, schema } = local;
//   try {
//     const rows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
//     if (rows.length === 0) return null;
//     return { id: rows[0].id, name: rows[0].name, email: rows[0].email, image: rows[0].image, emailVerified: rows[0].emailVerified };
//   } catch { return null; }
// }

// async function clearLocalSessions(userId: string) {
//   const local = getLocalDbSafe();
//   if (!local) return;
//   const { db, schema } = local;
//   try { await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId)); } 
//   catch (e) { console.warn('[useOfflineAuth] Error limpiando sesiones locales:', e); }
// }

// async function getCachedUser(): Promise<CachedUser | null> {
//   try {
//     const raw = await SecureStore.getItemAsync(CACHE_KEY);
//     if (!raw) return null;
//     return JSON.parse(raw) as CachedUser;
//   } catch { return null; }
// }

// async function setCachedUser(user: CachedUser): Promise<void> {
//   try { await SecureStore.setItemAsync(CACHE_KEY, JSON.stringify(user)); } 
//   catch (e) { console.warn('[useOfflineAuth] Error guardando cache:', e); }
// }

// async function clearCachedUser(): Promise<void> {
//   try { await SecureStore.deleteItemAsync(CACHE_KEY); } 
//   catch (e) { console.warn('[useOfflineAuth] Error limpiando cache:', e); }
// }


// ---------------------------------------------------------------------------
// Hook principal
// ---------------------------------------------------------------------------

export function useOfflineAuth()  {
  const session = useSession();
  const { isOnline } = useConnectivity();
  const remoteSessionEnabled = isOnline;

  // Estado local del usuario (puede venir de cache o del servidor)
  const [cachedUser, setCachedUser] = useState<CachedUser | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Ref para saber si alguna vez estuvo autenticado en esta sesión
  const wasAuthenticatedRef = useRef(false);

  // Usuario actual: del servidor solo cuando está online
  const serverUser = remoteSessionEnabled ? (session.data?.user as CachedUser | null) : null;
  const remoteSessionData = remoteSessionEnabled ? session.data : null;
  const remoteSessionError = remoteSessionEnabled ? session.error : null;
  const remoteSessionPending = remoteSessionEnabled ? session.isPending : false;

  /**
   * Determina el usuario efectivo basado en el estado de conexión:
   * - Si hay conexión y el servidor responde, usa datos del servidor
   * - Si tenemos cache y estuvimos autenticados, mantiene el cache
   *   (esto cubre tanto offline como durante refetch en reconexión)
   * - Si nunca estuvo autenticado, no tiene usuario
   */
  const effectiveUser = (() => {
    // Si está online y el servidor tiene datos válidos, priorizar
    if (remoteSessionEnabled && serverUser) {
      return serverUser;
    }

    // Si tenemos cache y estuvimos autenticados, SIEMPRE mantener el cache
    // Esto evita flickering durante:
    // - Modo offline
    // - Refetch cuando vuelve la conexión
    // - Cualquier momento donde serverUser sea temporalmente null
    if (cachedUser && wasAuthenticatedRef.current) {
      return cachedUser;
    }

    // Si está cargando la sesión inicial y tenemos cache, mostrar cache
    if (remoteSessionPending && cachedUser) {
      return cachedUser;
    }

    return null;
  })();

// Guardar usuario en cache local
  const cacheUser = useCallback(async (user: CachedUser) => {
    try {
      const sessionData: CachedSession = {
        user,
        cachedAt: Date.now(),
      };
      await SecureStore.setItemAsync(CACHED_USER_KEY, JSON.stringify(sessionData));
      setCachedUser(user);
      wasAuthenticatedRef.current = true;
    } catch (error) {
      console.error('Error caching user:', error);
    }
  }, []);

  // Limpiar cache local
  const clearCache = useCallback(async () => {
    try {
      await SecureStore.deleteItemAsync(CACHED_USER_KEY);
      await SecureStore.deleteItemAsync(CACHED_SESSION_KEY);
      setCachedUser(null);
      wasAuthenticatedRef.current = false;
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }, []);

  // Cargar usuario desde cache al iniciar
  const loadCachedUser = useCallback(async () => {
    try {
      const cached = await SecureStore.getItemAsync(CACHED_USER_KEY);
      if (cached) {
        const sessionData: CachedSession = JSON.parse(cached);
        setCachedUser(sessionData.user);
        wasAuthenticatedRef.current = true;

        // Verificar si el cache no es muy viejo (30 días max)
        const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 días en ms
        if (Date.now() - sessionData.cachedAt > maxAge) {
          console.warn('Cached session is too old, will need to re-authenticate');
        }
      }
    } catch (error) {
      console.error('Error loading cached user:', error);
    } finally {
      setIsInitialized(true);
    }
  }, []);

  // Cargar cache al montar
  useEffect(() => {
    loadCachedUser();
  }, [loadCachedUser]);

  // Sincronizar con servidor cuando hay datos nuevos y estamos online
  useEffect(() => {
    if (serverUser && isOnline) {
      cacheUser(serverUser);
      setSyncError(null);
    }
  }, [serverUser, isOnline, cacheUser]);

  // Detectar errores de sincronización cuando está offline
  useEffect(() => {
    if (!isOnline) {
      setSyncError('No hay conexión a internet. Usando datos locales.');
      return;
    }

    if (remoteSessionError) {
      setSyncError('Error al sincronizar sesión.');
    } else {
      setSyncError(null);
    }
  }, [isOnline, remoteSessionError]);

  // Refetch manual solo si hay conexión
  const refetchSession = useCallback(async () => {
    if (!isOnline) {
      setSyncError('No se puede sincronizar sin conexión a internet.');
      return;
    }

    try {
      await session.refetch();
      setSyncError(null);
    } catch {
      setSyncError('Error al sincronizar sesión.');
    }
  }, [isOnline, session]);

  // isLoading SOLO es true durante la inicialización del cache local.
  // Una vez inicializado, NUNCA vuelve a ser true.
  // Esto evita que el RootNavigator se desmonte durante operaciones de auth
  // (como registro o login) que podrían causar session.isPending = true temporalmente.
  const isLoading = !isInitialized;

  return {
    // Usuario efectivo (local-first)
    user: effectiveUser,

    // Estados de carga
    isLoading,
    isInitialized,

    // Estado de autenticación (local-first)
    isAuthenticated: !!effectiveUser,
    wasAuthenticated: wasAuthenticatedRef.current,

    // Estado de conexión y sincronización
    isOnline,
    remoteSessionEnabled,
    isSynced: isOnline && !!serverUser && !remoteSessionError,
    syncError,

    // Datos del servidor (puede ser null si offline)
    serverUser,
    serverSession: remoteSessionData,

    // Acciones
    refetchSession,
    clearCache,
    cacheUser,

    // Exponer el session original para casos especiales
    rawSession: session,
  };
}

/**
 * Verifica si el usuario puede realizar una acción que requiere conexión
 */
export function useRequiresOnline() {
  const { isOnline } = useConnectivity();

  const requireOnline = useCallback(
    (action: string): boolean => {
      if (!isOnline) {
        console.warn(`La acción "${action}" requiere conexión a internet.`);
        return false;
      }
      return true;
    },
    [isOnline]
  );

  return { isOnline, requireOnline };
}
