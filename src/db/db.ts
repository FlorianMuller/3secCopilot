import { drizzle } from "drizzle-orm/expo-sqlite";
import * as SQLite from "expo-sqlite";

export const expoSqliteDb = SQLite.openDatabaseSync("db.db");
export const db = drizzle(expoSqliteDb, { casing: "snake_case" });
