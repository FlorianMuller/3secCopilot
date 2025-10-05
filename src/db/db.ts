import { drizzle } from "drizzle-orm/expo-sqlite";
import { defaultDatabaseDirectory, openDatabaseSync } from "expo-sqlite";

const DATABASE_FILENAME = "db.db";

function joinDatabasePath(databaseName: string, directory: string | null): string {
  if (databaseName === ":memory:") {
    return databaseName;
  }

  if (!directory) {
    return databaseName;
  }

  const sanitizedDirectory = directory.replace(/\/*$/, "");
  const sanitizedName = databaseName.replace(/^\/+/, "");
  return `${sanitizedDirectory}/${sanitizedName}`;
}

export const expoSqliteDbPath = joinDatabasePath(DATABASE_FILENAME, defaultDatabaseDirectory ?? null);
export const expoSqliteDb = openDatabaseSync(DATABASE_FILENAME, undefined, defaultDatabaseDirectory ?? undefined);
export const db = drizzle(expoSqliteDb, { casing: "snake_case" });
