import { Options } from 'k6/options';

export const smokeOptions: Options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<3000'],
    checks: ['rate>0.95']
  }
};