export function canonicalHost(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';

    try {
        const url = new URL(raw.includes('://') ? raw : `http://${raw}`);
        const hostname = url.hostname.toLowerCase();
        const normalizedHostname = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
            ? 'localhost'
            : hostname;
        const port = url.port || (url.protocol === 'https:' ? '443' : '80');
        return `${normalizedHostname}:${port}`;
    } catch {
        return raw.toLowerCase();
    }
}

export function isSameOriginHost(origin, requestHost) {
    return canonicalHost(origin) === canonicalHost(requestHost);
}
