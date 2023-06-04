export function groupBy<K extends keyof any, V>(array: Array<V>, getKey: (elem: V) => K): Record<K, V[]> {
  const result: Record<K, V[]> = {} as Record<K, V[]>;

  for (const element of array) {
    const key = getKey(element);

    if (key in result) {
      result[key].push(element);
    } else {
      result[key] = [element];
    }
  }

  return result;
}
