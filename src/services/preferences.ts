import { eq } from "drizzle-orm";
import { useEffect, useState } from "react";
import { db } from "../db/db";
import { preferencesTable } from "../db/schema";
import { DayShiftTime } from "../features/Options/sections/DayShiftSection";
import { capitalize } from "../utils/capitalize";

// ----------------------------------------------------------------------------------------------------
// Generic preference function

export async function savePreference(key: string, value: string): Promise<void> {
  await db.insert(preferencesTable).values({ key, value }).onConflictDoUpdate({
    target: preferencesTable.key,
    set: {
      value,
    },
  });
}

export async function getPreference(key: string): Promise<string | null> {
  const result = await db.select().from(preferencesTable).where(eq(preferencesTable.key, key));
  if (result.length === 0) {
    return null;
  }
  return result[0].value;
}

export async function deletePreference(key: string): Promise<void> {
  await db.delete(preferencesTable).where(eq(preferencesTable.key, key));
}

// ----------------------------------------------------------------------------------------------------
// Helper to create specific preference function

type GetPreferenceFunction<T> = () => Promise<T | null>;
type GetPreferenceFunctionWithDefault<T> = () => Promise<T>;
type SetPreferenceFunction<T> = (value: T) => Promise<void>;
type DeletePreferenceFunction = () => Promise<void>;

type PreferenceHook<K extends string, T> = () => {
  [P in K | `save${Capitalize<K>}`]: P extends `save${Capitalize<K>}`
    ? (newValue: T) => Promise<void>
    : undefined | T | null;
};
type PreferenceHookWithDefault<K extends string, T> = () => {
  [P in K | `save${Capitalize<K>}`]: P extends `save${Capitalize<K>}` ? (newValue: T) => Promise<void> : undefined | T;
};

// Object with the 3 preferences function we want to use (get, set and delete)
type DynamicPreferenceFunctions<K extends string, T> = {
  [P in
    | `get${Capitalize<K>}Preference`
    | `set${Capitalize<K>}Preference`
    | `delete${Capitalize<K>}Preference`
    | `use${Capitalize<K>}Preference`]: P extends `get${Capitalize<K>}Preference`
    ? GetPreferenceFunction<T>
    : P extends `set${Capitalize<K>}Preference`
    ? SetPreferenceFunction<T>
    : P extends `delete${Capitalize<K>}Preference`
    ? DeletePreferenceFunction
    : PreferenceHook<K, T>;
};

type DynamicPreferenceFunctionsWithDefaultValue<K extends string, T> = {
  [P in
    | `get${Capitalize<K>}Preference`
    | `set${Capitalize<K>}Preference`
    | `delete${Capitalize<K>}Preference`
    | `use${Capitalize<K>}Preference`]: P extends `get${Capitalize<K>}Preference`
    ? GetPreferenceFunctionWithDefault<T>
    : P extends `set${Capitalize<K>}Preference`
    ? SetPreferenceFunction<T>
    : P extends `delete${Capitalize<K>}Preference`
    ? DeletePreferenceFunction
    : PreferenceHookWithDefault<K, T>;
};

// Used to save T as string and read string as T
interface Converter<T> {
  toString: (value: T) => string;
  fromString: (value: string | null) => T | null;
}

// Create preference functions that set/get/delete
function createPreferencesFunctions<K extends string, T>(
  key: K,
  converter: Converter<T>
): DynamicPreferenceFunctions<K, T>;
function createPreferencesFunctions<K extends string, T>(
  key: K,
  converter: Converter<T>,
  defaultValue: T
): DynamicPreferenceFunctionsWithDefaultValue<K, T>;
function createPreferencesFunctions<K extends string, T>(
  key: K,
  converter: Converter<T>,
  defaultValue?: T
): DynamicPreferenceFunctions<K, T> {
  const capitalizedKey = capitalize(key);

  const saveValue: SetPreferenceFunction<T> = (value: T) => savePreference(key, converter.toString(value));
  const getValue: GetPreferenceFunction<T> = async () => {
    const prefValue = converter.fromString(await getPreference(key));
    if (prefValue === null && defaultValue !== undefined) {
      return defaultValue;
    }
    return prefValue;
  };
  const deleteValue: DeletePreferenceFunction = () => deletePreference(key);
  const usePreferenceHook = () => {
    const [preference, setPreference] = useState<T | null>();

    async function retrievePreference() {
      const val = await getValue();
      setPreference(val);
    }

    useEffect(() => {
      retrievePreference();
    }, []);

    async function savePreference(newValue: T) {
      await saveValue(newValue);
      setPreference(newValue);
    }

    return {
      [key]: preference === null && defaultValue !== undefined ? defaultValue : preference,
      [`save${capitalizedKey}`]: savePreference,
    };
  };

  return {
    [`save${capitalizedKey}Preference`]: saveValue,
    [`get${capitalizedKey}Preference`]: getValue,
    [`delete${capitalizedKey}Preference`]: deleteValue,
    [`use${capitalizedKey}Preference`]: usePreferenceHook,
  } as DynamicPreferenceFunctions<K, T>;
}

// ----------------------------------------------------------------------------------------------------
// String to other types convertion
// (to store other types as string in the preferences table)

const stringConverter: Converter<string> = {
  toString: (v) => v,
  fromString: (v) => v,
};

const booleanConverter: Converter<boolean> = {
  toString: (v) => v.toString(),
  fromString: (v) => {
    if (v === null) {
      return null;
    }
    return v.toLowerCase() === "true";
  },
};

const dateConverter: Converter<Date> = {
  toString: (v) => v.toISOString(),
  fromString: (v) => {
    if (v === null) {
      return null;
    }
    return new Date(v);
  },
};

function objectConverter<T extends object>(): Converter<T> {
  return {
    toString: (v) => JSON.stringify(v),
    fromString: (v) => {
      if (v === null) {
        return null;
      }
      return JSON.parse(v) as T;
    },
  };
}

// ----------------------------------------------------------------------------------------------------
// Preferences definition

const preferences = {
  ...createPreferencesFunctions("useDarkTheme", booleanConverter),
  ...createPreferencesFunctions("birthday", dateConverter),
  ...createPreferencesFunctions("dayShift", objectConverter<DayShiftTime>(), { hour: 0, minute: 0 }),
};
export default preferences;
