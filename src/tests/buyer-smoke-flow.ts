import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Options } from 'k6/options';
import { generateSummary } from '../utils/summary';

const WEB_BASE_URL = __ENV.WEB_BASE_URL || 'https://dev.heyhomex.orangebd.com';
const API_BASE_URL =
  __ENV.API_BASE_URL || 'https://dev-api.heyhomex.orangebd.com/api';

const HAWAII_SEARCH_PLACES = [
  'Honolulu',
  'Waikiki',
  'Kailua',
  'Kaneohe',
  'Pearl City'
];

export const options: Options = {
  scenarios: {
    five_concurrent_search_users: {
      executor: 'per-vu-iterations',
      vus: 5,
      iterations: 1,
      maxDuration: '2m'
    }
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<5000'],
    checks: ['rate>0.95']
  }
};

function getPlaceForVu(): string {
  const index = (__VU - 1) % HAWAII_SEARCH_PLACES.length;
  return HAWAII_SEARCH_PLACES[index];
}

function extractResultInfo(responseBody: unknown): {
  resultCount: number;
  totalCount: number;
  preview: string;
} {
  let resultCount = 0;
  let totalCount = 0;
  let preview = '';

  try {
    const json: any =
      typeof responseBody === 'string'
        ? JSON.parse(responseBody)
        : responseBody;

    if (Array.isArray(json?.data)) {
      resultCount = json.data.length;
    } else if (Array.isArray(json?.data?.data)) {
      resultCount = json.data.data.length;
    } else if (Array.isArray(json?.properties)) {
      resultCount = json.properties.length;
    } else if (Array.isArray(json?.data?.properties)) {
      resultCount = json.data.properties.length;
    }

    totalCount =
      Number(json?.total) ||
      Number(json?.data?.total) ||
      Number(json?.meta?.total) ||
      Number(json?.pagination?.total) ||
      resultCount;

    preview = JSON.stringify(json).substring(0, 300);
  } catch (error) {
    preview = String(responseBody || '').substring(0, 300);
  }

  return {
    resultCount,
    totalCount,
    preview
  };
}

export default function (): void {
  const place = getPlaceForVu();
  const encodedPlace = encodeURIComponent(place);

  group(`VU ${__VU} search place: ${place}`, () => {
    const landingRes = http.get(WEB_BASE_URL, {
      tags: {
        page: 'landing',
        place
      }
    });

    check(landingRes, {
      'landing page status is 200': (res) => res.status === 200,
      'landing page response time under 5s': (res) =>
        res.timings.duration < 5000
    });

    const searchApiUrl = `${API_BASE_URL}/v1/property?search=${encodedPlace}`;

    const searchRes = http.get(searchApiUrl, {
      tags: {
        api: 'property-search',
        place
      }
    });

    const { resultCount, totalCount, preview } = extractResultInfo(
      searchRes.body
    );

    check(searchRes, {
      'search API status is 200': (res) => res.status === 200,
      'search API response time under 5s': (res) =>
        res.timings.duration < 5000,
      'search API returns response body': (res) =>
        String(res.body || '').length > 0,
      'search API returns property data': () => resultCount > 0
    });

    console.log(
      `VU ${__VU} searched: ${place} | Status: ${searchRes.status} | Results: ${resultCount} | Total: ${totalCount}`
    );

    console.log(`Response preview for ${place}: ${preview}`);
  });

  sleep(1);
}

export function handleSummary(data: any): Record<string, string> {
  return generateSummary(data);
}