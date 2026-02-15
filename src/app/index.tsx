import { View, Text, StyleSheet, Button, Alert } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useOfflineAuth } from '../hooks/useoffline-auth'; // Importamos el hook directo

export default function IndexPage() {
  const { logout } = useAuth();
  const { clearCache } = useOfflineAuth(); // Extraemos la función de limpieza directa

  // Opción 1: Logout estándar (Requiere internet según tu AuthContext)
  const handleStandardLogout = async () => {
    try {
      await logout();
    } catch (error) {
      Alert.alert("Error", "No se pudo conectar con el servidor para cerrar sesión.");
    }
  };

  // Opción 2: Borrado forzoso (Funciona Offline)
  const handleForceClear = async () => {
    try {
      await clearCache();
      Alert.alert("Caché Limpia", "Los datos locales han sido eliminados.");
    } catch (error) {
      Alert.alert("Error", "No se pudo limpiar la caché.");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>GameZone: Modo Organizador</Text>
      <Text style={styles.subtitle}>Panel de Control</Text>

      <View style={styles.buttonContainer}>
        {/* Botón Estándar */}
        <Button 
          title="Cerrar Sesión (Online)" 
          onPress={handleStandardLogout} 
        />
        
        <View style={styles.spacer} />

        {/* Botón de Emergencia/Offline */}
        <Button 
          title="Borrar Caché Local (Forzar)" 
          onPress={handleForceClear} 
          color="#FF3B30" // Rojo para diferenciar
        />
        <Text style={styles.hint}>Usar si hay errores de sincronización</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
  },
  buttonContainer: {
    width: '80%',
    gap: 10,
  },
  spacer: {
    height: 15,
  },
  hint: {
    marginTop: 5,
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  }
});