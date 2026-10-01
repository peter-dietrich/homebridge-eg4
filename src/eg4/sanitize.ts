const PRIVATE_KEYS = [
  'password',
  'account',
  'email',
  'noticeemail',
  'contactperson',
  'contactphone',
  'address',
  'latitude',
  'longitude',
  'lat',
  'lon',
  'lng',
  'cookie',
  'authorization',
  'token',
  'accesstoken',
  'refreshtoken',
  'session',
  'sessionid',
  'jsessionid',
  'secret',
  'plantname',
];

const SERIAL_KEYS = [
  'serial',
  'serialnum',
  'serialnumber',
  'deviceid',
  'plantid',
  'datalog',
  'mac',
];

function maskIdentifier(value: unknown): unknown {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return value;
  }

  const text = String(value);
  if (text.length <= 4) {
    return '***';
  }

  return `${'*'.repeat(Math.min(8, text.length - 4))}${text.slice(-4)}`;
}

export function sanitizeForSharing(value: unknown, key = ''): unknown {
  const normalizedKey = key.toLowerCase();

  if (PRIVATE_KEYS.includes(normalizedKey)) {
    return '[REDACTED]';
  }

  if (SERIAL_KEYS.some((candidate) => normalizedKey.includes(candidate))) {
    return maskIdentifier(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForSharing(item));
  }

  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};

    for (const [childKey, childValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      output[childKey] = sanitizeForSharing(childValue, childKey);
    }

    return output;
  }

  return value;
}
