export function slugify(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

export function getJsonPath(obj, path = 'user') {
  return String(path).split('.').reduce((acc, key) => acc?.[key], obj);
}

export function nowIso() {
  return new Date().toISOString();
}
