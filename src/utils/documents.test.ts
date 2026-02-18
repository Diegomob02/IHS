import { describe, expect, it } from 'vitest';
import { buildDocumentStoragePath, getFirstFolder, isUuid, normalizeSelectedPropertyId } from './documents';

describe('documents utils', () => {
  it('detects UUIDs', () => {
    expect(isUuid('00000000-0000-4000-8000-000000000000')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
  });

  it('builds storage paths under property folder when propertyId is uuid', () => {
    const propertyId = '11111111-1111-4111-8111-111111111111';
    const filePath = buildDocumentStoragePath(propertyId, 'Reporte.pdf');
    expect(filePath).toBe(`${propertyId}/Reporte.pdf`);
    expect(getFirstFolder(filePath)).toBe(propertyId);
  });

  it('builds storage paths under global folder when propertyId is missing/invalid', () => {
    expect(buildDocumentStoragePath(null, 'a.pdf')).toBe('global/a.pdf');
    expect(buildDocumentStoragePath(undefined, 'a.pdf')).toBe('global/a.pdf');
    expect(buildDocumentStoragePath('123', 'a.pdf')).toBe('global/a.pdf');
  });

  it('normalizes selected property id to owned list', () => {
    const owned = ['p1', 'p2'];
    expect(normalizeSelectedPropertyId(owned, 'p2')).toBe('p2');
    expect(normalizeSelectedPropertyId(owned, 'x')).toBe('p1');
    expect(normalizeSelectedPropertyId([], 'p1')).toBe('');
  });
});

