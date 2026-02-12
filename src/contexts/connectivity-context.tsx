import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import NetInfo from '@react-native-community/netinfo';

const ConnectivityContext = createContext<{ isOnline: boolean } | null>(null);

export function useConnectivity() {
  const context = useContext(ConnectivityContext);
  if (!context) throw new Error('useConnectivity must be used within ConnectivityProvider');
  return context;
}

export function ConnectivityProvider({ children }: PropsWithChildren) {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // isConnected puede ser null, forzamos booleano
      setIsOnline(!!state.isConnected);
    });
    return unsubscribe;
  }, []);

  return (
    <ConnectivityContext.Provider value={{ isOnline }}>{children}</ConnectivityContext.Provider>
  );
}