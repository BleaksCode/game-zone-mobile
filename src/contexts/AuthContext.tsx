import { createContext, useContext, useCallback, ReactNode, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useOfflineAuth, CachedUser } from '@/src/hooks/useoffline-auth'; // Asegúrate que la ruta sea correcta
import { useConnectivity } from './connectivity-context';
import { signIn, signOut, signUp } from '../lib/auth-client';
import { BetterFetchError } from '@better-fetch/fetch';
import { API_ENDPOINTS } from '../constants/api';
import { api } from '../lib/api.client';

interface User {
  id: string;
  name: string;
  email: string;
  image?: string;
  username?: string;
  emailVerified?: boolean;
}

interface AuthContextType {
  // Usuario y estado de autenticación (local-first)
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean; // true solo si email está verificado
  isLoggedIn: boolean; // true si hay sesión (aunque email no verificado)
  // needsEmailVerification: boolean; // true si email no está verificado
  // needsProfileCompletion: boolean;

  // Estado de conexión y sincronización
  isOnline: boolean;
  isSynced: boolean;
  isOfflineMode: boolean; // true cuando está autenticado pero offline

  // Acciones de autenticación (requieren conexión)
  login: (email: string, password: string) => Promise<void>;
  register: (data: any) => Promise<void>;
  // updateProfile: (data: {
  //   businessName: string;
  //   businessCategory: string;
  //   employeesAllowed: number;
  //   phoneNumber: string;
  //   birthDate: Date;
  // }) => Promise<void>;
  logout: () => Promise<void>;

  // Sincronización manual
  syncSession: () => Promise<void>;

  // Errores
  error: string | null;
  syncError: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isOnline } = useConnectivity();
  const offlineAuth = useOfflineAuth();
  const [error, setError] = useState<string | null>(null);

  const user = offlineAuth.user as User | null;

  // isLoggedIn: hay una sesión activa (aunque el email no esté verificado)
  const isLoggedIn = !!user;

  // needsEmailVerification: usuario logueado pero email no verificado
  const needsEmailVerification = isLoggedIn && user.emailVerified !== true;

  // isAuthenticated: solo true si está logueado Y email explícitamente verificado
  // Esto evita redirigir a tabs antes de verificar email
  const isAuthenticated = isLoggedIn && user.emailVerified === false;

  // Check if user needs to complete their profile (Google/social login users without birthDate)
  // const needsProfileCompletion = isAuthenticated && !user?.phoneNumber;

  // Determina si está en modo offline (autenticado localmente pero sin conexión)
  const isOfflineMode = isAuthenticated && !isOnline;

  const login = useCallback(
    async (email: string, password: string) => {
      setError(null);

      // Login requiere conexión
      if (!isOnline) {
        const errorMsg = 'Se requiere conexión a internet para iniciar sesión';
        setError(errorMsg);
        throw new Error(errorMsg);
      }

      const { error } = await signIn.email({ email, password });
      if (error) {
        setError(error.message ?? 'Error al iniciar sesión');
        throw new Error(error.message);
      }
    },
    [isOnline]
  );


  const register = useCallback(
    async (data: any) => {
      setError(null);

      // Registro requiere conexión
      if (!isOnline) {
        const errorMsg = 'Se requiere conexión a internet para registrarse';
        setError(errorMsg);
        throw new Error(errorMsg);
      }

      const { error } = await signUp.email(data);
      if (error) {
        setError(error.message ?? 'Error al registrar');
        throw new Error(error.message);
      }
    },
    [isOnline]
  );

// const updateProfile = useCallback(
//     async (data: {
//       businessName: string;
//       businessCategory: string;
//       employeesAllowed: number;
//       phoneNumber: string;
//       birthDate: Date;
//     }) => {
//       setError(null);

//       // Actualizar perfil requiere conexión
//       if (!isOnline) {
//         const errorMsg = 'Se requiere conexión a internet para actualizar el perfil';
//         setError(errorMsg);
//         throw new Error(errorMsg);
//       }

//       try {
//         const { error: apiError } = await api.post(API_ENDPOINTS.completeProfile, {
//           businessName: data.businessName,
//           businessCategory: data.businessCategory,
//           employeesAllowed: data.employeesAllowed,
//           phoneNumber: data.phoneNumber,
//           birthDate: data.birthDate.toISOString(),
//         });

//         if (apiError) {
//           const errorMessage = apiError.message ?? 'Error al actualizar perfil';
//           setError(errorMessage);
//           throw new Error(errorMessage);
//         }

//         // Refetch session to get updated user data
//         await offlineAuth.refetchSession();
//       } catch (err) {
//         if (err instanceof BetterFetchError) {
//           const errorMessage = err.message ?? 'Error al actualizar perfil';
//           setError(errorMessage);
//           throw new Error(errorMessage);
//         }
//         throw err;
//       }
//     },
//     [isOnline, offlineAuth]
//   );

  const logout = useCallback(async () => {
    // Logout requiere conexión para invalidar sesión en servidor
    if (!isOnline) {
      const errorMsg = 'Se requiere conexión a internet para cerrar sesión';
      setError(errorMsg);
      throw new Error(errorMsg);
    }

    try {
      await signOut();
      await SecureStore.deleteItemAsync('auth_token');
      await offlineAuth.clearCache();
    } catch (err) {
      // Si falla el logout en servidor pero estamos online, aún limpiar local
      await offlineAuth.clearCache();
      throw err;
    }
  }, [isOnline, offlineAuth]);
  
  const syncSession = useCallback(async () => {
    if (!isOnline) {
      return;
    }
    await offlineAuth.refetchSession();
  }, [isOnline, offlineAuth]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading: offlineAuth.isLoading,
        isAuthenticated,
        isLoggedIn,
        // needsEmailVerification,
        // needsProfileCompletion,
        isOnline,
        isSynced: offlineAuth.isSynced,
        isOfflineMode,
        login,
        register,
        // updateProfile,
        logout,
        syncSession,
        error,
        syncError: offlineAuth.syncError,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};