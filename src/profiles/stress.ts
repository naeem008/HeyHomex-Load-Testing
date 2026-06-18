import { Options } from 'k6/options';

export const stressOptions: Options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 20 },
    { duration: '30s', target: 0 }
  ],
  thresholds: {
    http_req_failed: ['rate<0.10'],
    http_req_duration: ['p(95)<6000'],
    checks: ['rate>0.90']
  }
};