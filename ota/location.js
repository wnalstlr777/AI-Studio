export const releaseMarker = '__hina_release/';
export function appRoot(url) {
  const address = new URL(url);
  const marker = address.pathname.indexOf('/' + releaseMarker);
  return marker === -1 ? new URL('../', address) : new URL(address.pathname.slice(0, marker + 1), address);
}
