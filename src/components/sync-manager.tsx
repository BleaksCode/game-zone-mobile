// import { useEffect } from 'react';
// import { useConnectivity } from '@/src/contexts/connectivity-context';
// import { useAuth } from '@/src/contexts/AuthContext';
// // Aquí importaríamos tu lógica real de sync cuando esté lista
// // import { syncPendingData } from '@/modules/sync/service'; 

// export function SyncManager() {
//   const { isOnline } = useConnectivity();
//   const { isAuthenticated, user } = useAuth();

//   useEffect(() => {
//     if (isOnline && isAuthenticated && user) {
//       console.log(`[SyncManager] Usuario ${user.email} online. Iniciando sincronización...`);
      
//       // AQUÍ IRÁ TU LÓGICA DE SINCRONIZACIÓN
//       // Ejemplo:
//       // TournamentRepository.getPendingSync().then(pending => {
//       //    if (pending.length > 0) pushToRemote(pending);
//       // });
      
//     }
//   }, [isOnline, isAuthenticated, user]);

//   return null; // Componente lógico, no renderiza nada
// }