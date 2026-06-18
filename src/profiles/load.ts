import { Options } from 'k6/options';

export const loadOptions: Options = {
  stages: [
    { duration: '30s', target: 5 },
    { duration: '1m', target: 5 },
    { duration: '30s', target: 0 }
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<4000'],
    checks: ['rate>0.95']
  }
};

// test program