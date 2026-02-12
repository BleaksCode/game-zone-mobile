import { createContext, useContext, useCallback, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useOfflineAuth, CachedUser } from '@/src/hooks/useoffline-auth'; // Asegúrate que la ruta sea correcta
import { useConnectivity } from './connectivity-context';

interface AuthContextType {
  user: CachedUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isOnline: boolean;
  isSynced: boolean;
  
  // Acciones
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  syncSession: () => Promise<void>;

  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isOnline } = useConnectivity();
  
  // Usamos tu hook existente que ya maneja la lógica heavy
  const offlineAuth = useOfflineAuth();

  const login = useCallback(async (email: string, password: string) => {
    // El hook useOfflineAuth ya verifica isOnline internamente, 
    // pero podemos hacer doble check si queremos mensajes personalizados
    const success = await offlineAuth.login(email, password);
    if (!success) {
      throw new Error(offlineAuth.error || 'Error al iniciar sesión');
    }
  }, [offlineAuth]);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const success = await offlineAuth.register(name, email, password);
    if (!success) {
      throw new Error(offlineAuth.error || 'Error al registrarse');
    }
  }, [offlineAuth]);

  const logout = useCallback(async () => {
    await offlineAuth.logout();
    // Limpieza adicional si fuera necesaria
    await SecureStore.deleteItemAsync('user_session'); 
  }, [offlineAuth]);

  const syncSession = useCallback(async () => {
    if (isOnline) {
      await offlineAuth.refreshSession();
    }
  }, [isOnline, offlineAuth]);

  return (
    <AuthContext.Provider
      value={{
        user: offlineAuth.user,
        isLoading: offlineAuth.isLoading,
        isAuthenticated: offlineAuth.isAuthenticated,
        isOnline,
        isSynced: offlineAuth.isSyncing, // Mapeamos isSyncing a isSynced para feedback visual
        login,
        register,
        logout,
        syncSession,
        error: offlineAuth.error,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
};