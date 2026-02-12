/**
 * hooks/use-offline-auth.ts
 * ---------------------------
 * Hook principal de autenticacion local-first para GameZone.
 * Integra validacion de red via ConnectivityContext.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import { authClient } from '@/src/lib/auth-client';
import { eq } from 'drizzle-orm';
import { useConnectivity } from '@/src/contexts/connectivity-context';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const CACHE_KEY = 'gamezone_user_session';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface CachedUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  emailVerified?: boolean;
}

interface UseOfflineAuthReturn {
  user: CachedUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isSyncing: boolean;
  isOnline: boolean; 
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (name: string, email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers: SQLite & SecureStore
// ---------------------------------------------------------------------------

function getLocalDbSafe() {
  try {
    // Importamos del cliente que AHORA es solo local
    // Asegúrate de que client.ts esté configurado con 'app-db.db'
    const { getLocalDb } = require('@/src/db/client');
    const db = getLocalDb();
    if (!db) return null;
    const schema = require('@/src/db/schema');
    return { db, schema };
  } catch {
    return null;
  }
}

async function ensureLocalTables() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initLocalDatabase } = require('@/src/db/client');
    await initLocalDatabase();
  } catch (e) {
    console.warn('[useOfflineAuth] Error inicializando tablas locales:', e);
  }
}

async function upsertLocalUser(userData: CachedUser) {
  const local = getLocalDbSafe();
  if (!local) return;
  const { db, schema } = local;
  try {
    const existing = await db.select().from(schema.users).where(eq(schema.users.id, userData.id)).limit(1);
    if (existing.length > 0) {
      await db.update(schema.users).set({
        name: userData.name, email: userData.email, image: userData.image ?? null,
        emailVerified: userData.emailVerified ?? false, updatedAt: new Date().toISOString(),
      }).where(eq(schema.users.id, userData.id));
    } else {
      await db.insert(schema.users).values({
        id: userData.id, name: userData.name, email: userData.email, image: userData.image ?? null,
        emailVerified: userData.emailVerified ?? false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
    }
  } catch (e) { console.warn('[useOfflineAuth] Error upserting local user:', e); }
}

async function getLocalUser(userId: string): Promise<CachedUser | null> {
  const local = getLocalDbSafe();
  if (!local) return null;
  const { db, schema } = local;
  try {
    const rows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (rows.length === 0) return null;
    return { id: rows[0].id, name: rows[0].name, email: rows[0].email, image: rows[0].image, emailVerified: rows[0].emailVerified };
  } catch { return null; }
}

async function clearLocalSessions(userId: string) {
  const local = getLocalDbSafe();
  if (!local) return;
  const { db, schema } = local;
  try { await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId)); } 
  catch (e) { console.warn('[useOfflineAuth] Error limpiando sesiones locales:', e); }
}

async function getCachedUser(): Promise<CachedUser | null> {
  try {
    const raw = await SecureStore.getItemAsync(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachedUser;
  } catch { return null; }
}

async function setCachedUser(user: CachedUser): Promise<void> {
  try { await SecureStore.setItemAsync(CACHE_KEY, JSON.stringify(user)); } 
  catch (e) { console.warn('[useOfflineAuth] Error guardando cache:', e); }
}

async function clearCachedUser(): Promise<void> {
  try { await SecureStore.deleteItemAsync(CACHE_KEY); } 
  catch (e) { console.warn('[useOfflineAuth] Error limpiando cache:', e); }
}


// ---------------------------------------------------------------------------
// Hook principal
// ---------------------------------------------------------------------------

export function useOfflineAuth(): UseOfflineAuthReturn {
  const [user, setUser] = useState<CachedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { isOnline } = useConnectivity();

  const syncRef = useRef(false);
  const hydratedRef = useRef(false);

  // --- Fase 1: Hidratacion Cache ---
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    async function hydrate() {
      const cached = await getCachedUser();
      if (cached) {
        await ensureLocalTables();
        const localUser = await getLocalUser(cached.id);
        if (localUser) setUser(cached);
        else { await upsertLocalUser(cached); setUser(cached); }
      }
      setIsLoading(false);
      
      // Intentar sync solo si hay red
      if (isOnline) syncWithServer(cached);
    }
    hydrate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Solo al montar

  // --- Sincronización Reactiva ---
  useEffect(() => {
    if (isOnline && user && !isSyncing) {
      syncRef.current = false;
      syncWithServer(user);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  // --- Fase 2: Sync Server ---
  const syncWithServer = useCallback(async (cachedUser: CachedUser | null) => {
    if (!isOnline) return; 

    if (syncRef.current) return;
    syncRef.current = true;
    setIsSyncing(true);

    try {
      const sessionResponse = await authClient.getSession();
      const serverUser = sessionResponse?.data?.user;

      if (serverUser) {
        const normalizedUser: CachedUser = {
          id: serverUser.id,
          name: serverUser.name,
          email: serverUser.email,
          image: serverUser.image ?? null,
          emailVerified: serverUser.emailVerified ?? false,
        };

        const hasChanged = !cachedUser ||
          cachedUser.id !== normalizedUser.id ||
          cachedUser.name !== normalizedUser.name ||
          cachedUser.email !== normalizedUser.email;

        if (hasChanged) {
          await setCachedUser(normalizedUser);
          await ensureLocalTables();
          await upsertLocalUser(normalizedUser);
          setUser(normalizedUser);
        }
      } else if (cachedUser) {
        // Sesión inválida en servidor -> logout local
        await clearCachedUser();
        if (cachedUser.id) await clearLocalSessions(cachedUser.id);
        setUser(null);
      }
    } catch (e) {
      console.warn('[useOfflineAuth] Sync falló (modo offline mantenido):', e);
    } finally {
      setIsSyncing(false);
      syncRef.current = false;
    }
  }, [isOnline]);

  // --- Login (MEJORADO) ---
  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setError(null);

    if (!isOnline) {
        setError('No hay conexión a internet.');
        return false;
    }

    try {
      const response = await authClient.signIn.email({ email, password });
      
      // ERROR HANDLING MEJORADO
      if (response.error) {
        console.error("[Auth] Login Failed:", response.error);
        
        // Prioridad: Mensaje del servidor > Texto de estado > Fallback genérico con código
        const errorMsg = response.error.message || 
                         response.error.statusText || 
                         `Error del servidor (${response.error.status})`;
                         
        setError(errorMsg);
        return false;
      }

      const userData = response.data?.user;
      if (!userData) { 
        setError('Error: El servidor no devolvió datos de usuario.'); 
        return false; 
      }

      const cachedUser: CachedUser = {
        id: userData.id, name: userData.name, email: userData.email,
        image: userData.image ?? null, emailVerified: userData.emailVerified ?? false,
      };

      await setCachedUser(cachedUser);
      await ensureLocalTables();
      await upsertLocalUser(cachedUser);
      setUser(cachedUser);
      return true;

    } catch (e) { 
      console.error("[Auth] Exception during login:", e);
      setError(e instanceof Error ? e.message : 'Error inesperado al iniciar sesión'); 
      return false; 
    }
  }, [isOnline]);

  // --- Register (MEJORADO) ---
  const register = useCallback(async (name: string, email: string, password: string): Promise<boolean> => {
    setError(null);

    if (!isOnline) {
        setError('No hay conexión a internet.');
        return false;
    }

    try {
      const response = await authClient.signUp.email({ name, email, password });
      
      // ERROR HANDLING MEJORADO
      if (response.error) {
        console.error("[Auth] Register Failed:", response.error);
        
        const errorMsg = response.error.message || 
                         response.error.statusText || 
                         `Error del servidor (${response.error.status})`;
        
        setError(errorMsg); 
        return false; 
      }

      const userData = response.data?.user;
      if (!userData) { 
        setError('Error: El servidor no devolvió datos de usuario.'); 
        return false; 
      }

      const cachedUser: CachedUser = {
        id: userData.id, name: userData.name, email: userData.email,
        image: userData.image ?? null, emailVerified: userData.emailVerified ?? false,
      };

      await setCachedUser(cachedUser);
      await ensureLocalTables();
      await upsertLocalUser(cachedUser);
      setUser(cachedUser);
      return true;

    } catch (e) { 
      console.error("[Auth] Exception during register:", e);
      setError(e instanceof Error ? e.message : 'Error inesperado al registrarse'); 
      return false; 
    }
  }, [isOnline]);

  // --- Logout ---
  const logout = useCallback(async () => {
    setError(null);
    const currentUser = user;

    try {
      if (isOnline) await authClient.signOut();
    } catch (e) { console.warn('Error logout servidor:', e); }

    await clearCachedUser();
    if (currentUser?.id) await clearLocalSessions(currentUser.id);
    setUser(null);
  }, [user, isOnline]);

  const refreshSession = useCallback(async () => {
    syncRef.current = false;
    await syncWithServer(user);
  }, [user, syncWithServer]);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    isSyncing,
    isOnline,
    error,
    login,
    register,
    logout,
    refreshSession,
  };
}