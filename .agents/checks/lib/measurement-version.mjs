export const MEASUREMENT_VERSION = 'measurement-rules-v1';
export const isMeasurementVersion = value => typeof value === 'string' && /^measurement-rules-v[1-9]\d*$/.test(value);
