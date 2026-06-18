import { Options } from 'k6/options';
import { smokeOptions } from '../profiles/smoke';
import { loadOptions } from '../profiles/load';
import { stressOptions } from '../profiles/stress';

export const BASE_URL = __ENV.BASE_URL || 'https://dev.heyhomex.orangebd.com';
export const PROFILE = __ENV.PROFILE || 'smoke';

export function getOptions(): Options {
  if (PROFILE === 'load') {
    return loadOptions;
  }

  if (PROFILE === 'stress') {
    return stressOptions;
  }

  return smokeOptions;
}