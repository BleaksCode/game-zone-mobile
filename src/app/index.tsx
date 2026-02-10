import { View, Text, StyleSheet } from 'react-native';

export default function IndexPage() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>GameZone: Modo Organizador</Text>
      <Text style={styles.subtitle}>El sistema está listo para pruebas de API</Text>
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
  },
});