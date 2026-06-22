import http from 'k6/http';
import { check } from 'k6';

const TARGET_URL =
  __ENV.TARGET_URL ||
  'https://dev.heyhomex.orangebd.com/';

const requestedVus = Number(
  __ENV.TARGET_VUS || '10000'
);

const TARGET_VUS =
  Number.isFinite(requestedVus) &&
  requestedVus > 0
    ? Math.floor(requestedVus)
    : 10000;

export const options = {
  /*
   * Response body memory-te rakha hobe na.
   * Large concurrent test-er memory usage
   * komanor jonno eta use kora hoyeche.
   */
  discardResponseBodies: true,

  scenarios: {
    landing_page_concurrent_users: {
      /*
       * Prottek VU exactly 1 bar
       * landing page request korbe.
       *
       * 10,000 VUs × 1 iteration
       * = 10,000 landing-page requests.
       */
      executor: 'per-vu-iterations',

      vus: TARGET_VUS,

      iterations: 1,

      maxDuration: '10m',

      gracefulStop: '30s',
    },
  },

  thresholds: {
    /*
     * Maximum 1% HTTP request
     * fail accept kora hobe.
     */
    http_req_failed: [
      'rate<0.01',
    ],

    /*
     * 95% response 3 second-er niche
     * ebong 99% response 5 second-er
     * niche hote hobe.
     */
    http_req_duration: [
      'p(95)<3000',
      'p(99)<5000',
    ],

    /*
     * Minimum 99% functional check
     * pass korte hobe.
     */
    checks: [
      'rate>0.99',
    ],
  },

  summaryTrendStats: [
    'avg',
    'min',
    'med',
    'max',
    'p(90)',
    'p(95)',
    'p(99)',
  ],
};

export default function (): void {
  const response = http.get(
    TARGET_URL,
    {
      redirects: 5,

      timeout: '30s',

      headers: {
        Accept:
          'text/html,application/xhtml+xml,' +
          'application/xml;q=0.9,*/*;q=0.8',

        'User-Agent':
          'HeyHomex-k6-Landing-Page-Test/1.0',
      },

      tags: {
        name: 'GET HeyHomex landing page',
        page: 'landing',
      },
    }
  );

  const contentType = String(
    response.headers['Content-Type'] ||
    response.headers['content-type'] ||
    ''
  ).toLowerCase();

  check(response, {
    'landing page status is 200':
      () => response.status === 200,

    'landing page returns HTML':
      () =>
        contentType.includes(
          'text/html'
        ),

    'landing page request is not redirected':
      () =>
        response.url === TARGET_URL ||
        response.url ===
          TARGET_URL.replace(/\/$/, ''),
  });
}