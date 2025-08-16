export function getDaysBetween(start: Date, end: Date) {
  const dates: Date[] = [];
  let lastDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (lastDate.getTime() >= end.getTime()) {
    dates.push(lastDate);
    // new date
    lastDate = new Date(lastDate);
    // minus 1 day
    lastDate.setDate(lastDate.getDate() - 1);
  }

  return dates;
}
