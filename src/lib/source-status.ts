import type { SourceStatus } from '../../shared/types';

export function sourceStatusLabel(source: SourceStatus): string {
  if (source.status === 'error') return 'עדכון נכשל';
  if (source.status === 'pending' && !source.observationDate) return 'אין נתון';
  if (source.status === 'pending') return 'ממתין לעדכון';
  if (source.status === 'stale') return 'נתון מיושן';
  return 'תקין';
}

export function sourceStatusNote(source: SourceStatus): string | null {
  if (source.status === 'error') {
    const reason = source.failureKind === 'timeout' ? 'המקור לא הגיב בזמן' : source.failureKind === 'malformed' ? 'התקבל מידע לא תקין מהמקור' : 'המקור לא היה זמין בעדכון האחרון';
    return source.observationDate
      ? `${reason}; העדכון האחרון נכשל, אך הנתון הקודם נשמר.`
      : `${reason}, ולכן כרגע אין נתון זמין מהמקור.`;
  }
  if (source.status === 'stale') return 'הנתון האחרון ישן מהרגיל; הוא נשמר ומוצג עד לעדכון הבא.';
  if (source.status === 'pending' && !source.observationDate) return 'טרם נקלטו נתונים מהמקור.';
  return null;
}

export function sourceCheckedAt(source: SourceStatus): string | null {
  return source.checkedAt ?? source.lastErrorAt ?? source.lastSuccessAt;
}
