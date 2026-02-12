import { createContext, type PropsWithChildren, useContext, useMemo } from 'react';
import type { SQLiteDatabase } from 'expo-sqlite';
import { SQLiteProvider, useSQLiteContext, openDatabaseSync } from 'expo-sqlite';
import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import migrations from '../../drizzle/migrations';
import { useDrizzleStudio } from 'expo-drizzle-studio-plugin';

const Logger = console;
const databaseName = 'app-db.db';

const db = openDatabaseSync(databaseName);

const DrizzleContext = createContext<ExpoSQLiteDatabase | null>(null);

export function useDrizzle() {
  const context = useContext(DrizzleContext);
  if (!context) {
    throw new Error('useDrizzle must be used within a DrizzleProvider');
  }
  return context;
}

function DrizzleProvider({ children }: PropsWithChildren) {
  const sqliteDb = useSQLiteContext();

  const db = useMemo(() => {
    Logger.info('Creating Drizzle instance');
    return drizzle(sqliteDb);
  }, [sqliteDb]);

  return <DrizzleContext.Provider value={db}>{children}</DrizzleContext.Provider>;
}

async function migrateAsync(db: SQLiteDatabase) {
  const drizzleDb = drizzle(db);
  await migrate(drizzleDb, migrations);
}

const options = { enableChangeListener: true };

export function DatabaseProvider({ children }: PropsWithChildren) {
  useDrizzleStudio(db);

  return (
    <SQLiteProvider
      databaseName={databaseName}
      onError={Logger.error}
      onInit={migrateAsync}
      options={options}>
      <DrizzleProvider>{children}</DrizzleProvider>
    </SQLiteProvider>
  );
}
