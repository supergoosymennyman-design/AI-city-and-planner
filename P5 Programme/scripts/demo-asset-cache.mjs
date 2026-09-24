export function assetCacheHeaders(file, info) {
  if (/\.html$/i.test(file)) return { 'cache-control': 'no-store' };
  return {
    'cache-control': 'private, no-cache',
    etag: `W/"${info.size.toString(16)}-${info.mtimeMs.toString(16)}-${info.ctimeMs.toString(16)}"`,
  };
}

export function assetNotModified(request, headers) {
  const etag = headers.get('etag');
  const condition = request.headers.get('if-none-match');
  if (!etag || !condition) return false;
  const weak = value => value.trim().replace(/^W\//, '');
  return condition.split(',').some(value => value.trim() === '*' || weak(value) === weak(etag));
}
