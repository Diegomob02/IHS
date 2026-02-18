export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

export function buildDocumentStoragePath(propertyId: string | null | undefined, fileName: string): string {
  const folder = propertyId && isUuid(propertyId) ? propertyId : 'global';
  return `${folder}/${fileName}`;
}

export function normalizeDocumentsObjectPath(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const publicOrSignedPrefixMatch = trimmed.match(/\/storage\/v1\/object\/(?:public|sign)\/documents\/(.+)$/i);
  if (publicOrSignedPrefixMatch?.[1]) {
    const pathWithMaybeQuery = publicOrSignedPrefixMatch[1];
    return pathWithMaybeQuery.split('?')[0] ?? null;
  }

  const bucketPrefix = 'documents/';
  if (trimmed.startsWith(bucketPrefix)) return trimmed.slice(bucketPrefix.length);

  return trimmed;
}

export function getFirstFolder(filePath: string): string {
  const folder = filePath.split('/')[0] ?? '';
  return folder;
}

export function normalizeSelectedPropertyId(ownedPropertyIds: string[], selectedPropertyId: string): string {
  if (ownedPropertyIds.length === 0) return '';
  if (ownedPropertyIds.includes(selectedPropertyId)) return selectedPropertyId;
  return ownedPropertyIds[0];
}
