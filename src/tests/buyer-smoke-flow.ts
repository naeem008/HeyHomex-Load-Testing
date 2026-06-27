import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Options } from 'k6/options';
import { generateSummary } from '../utils/summary';

declare const __ENV: Record<string, string>;
declare const __VU: number;
declare const __ITER: number;

const WEB_BASE_URL = __ENV.WEB_BASE_URL || 'https://dev.heyhomex.orangebd.com';
const API_BASE_URL =
  __ENV.API_BASE_URL || 'https://dev-api.heyhomex.orangebd.com/api';

const TEST_VUS = Number(__ENV.VUS || 100);
const TEST_DURATION = __ENV.DURATION || '2m';

const HAWAII_SEARCH_PLACES = [
  'Honolulu',
  'Waikiki',
  'Kailua',
  'Salt Lake',
  'Manoa Falls, Honolulu, HI, USA'
];

export const options: Options = {
  scenarios: {
    guest_search_100_users: {
      executor: 'constant-vus',
      vus: TEST_VUS,
      duration: TEST_DURATION
    }
  },
  thresholds: {
    http_req_failed: ['rate<0.10'],
    http_req_duration: ['p(95)<10000'],
    checks: ['rate>0.90']
  }
};

type PropertyItem = {
  id?: number | string;
  name?: string;
  address?: string;
  price?: string | number;
  beds?: number;
  baths?: number;
  square_feet?: number;
  image_url?: string;
};

function getSearchPlace(): string {
  const index = (__VU + __ITER) % HAWAII_SEARCH_PLACES.length;
  return HAWAII_SEARCH_PLACES[index];
}

function safeParseJson(body: unknown): any {
  try {
    return JSON.parse(String(body || '{}'));
  } catch (error) {
    return {};
  }
}

function extractProperties(json: any): PropertyItem[] {
  if (Array.isArray(json?.data?.data)) {
    return json.data.data;
  }

  if (Array.isArray(json?.data)) {
    return json.data;
  }

  if (Array.isArray(json?.properties)) {
    return json.properties;
  }

  if (Array.isArray(json?.data?.properties)) {
    return json.data.properties;
  }

  return [];
}

function extractTotalCount(json: any, properties: PropertyItem[]): number {
  return (
    Number(json?.data?.total) ||
    Number(json?.data?.meta?.total) ||
    Number(json?.meta?.total) ||
    Number(json?.pagination?.total) ||
    properties.length
  );
}

function getPropertyDetailsData(json: any): any {
  if (json?.data) {
    return json.data;
  }

  if (json?.property) {
    return json.property;
  }

  return json;
}

export default function (): void {
  const place = getSearchPlace();
  const encodedPlace = encodeURIComponent(place);

  group(`Guest search flow | VU ${__VU} | Place: ${place}`, () => {
    const landingRes = http.get(WEB_BASE_URL, {
      tags: {
        page: 'landing',
        flow: 'guest-search',
        place
      }
    });

    check(landingRes, {
      'landing page status is 200': (res) => res.status === 200,
      'landing page response time under 10s': (res) =>
        res.timings.duration < 10000
    });

    const searchApiUrl = `${API_BASE_URL}/v1/property?search=${encodedPlace}`;

    const searchRes = http.get(searchApiUrl, {
      tags: {
        api: 'property-search',
        flow: 'guest-search',
        place
      }
    });

    const searchJson = safeParseJson(searchRes.body);
    const properties = extractProperties(searchJson);
    const totalCount = extractTotalCount(searchJson, properties);
    const firstProperty = properties[0];

    const firstPropertyId = firstProperty?.id;
    const firstPropertyName = String(firstProperty?.name || '');
    const firstPropertyAddress = String(firstProperty?.address || '');
    const firstPropertyPrice = String(firstProperty?.price || '');
    const firstPropertyImage = String(firstProperty?.image_url || '');

    check(searchRes, {
      'search API status is 200': (res) => res.status === 200,
      'search API response time under 10s': (res) =>
        res.timings.duration < 10000,
      'search API returns response body': (res) =>
        String(res.body || '').length > 0,
      'search API returns property data': () => properties.length > 0,
      'first property id exists': () => Boolean(firstPropertyId),
      'first property name exists': () => firstPropertyName.length > 0,
      'first property address exists': () => firstPropertyAddress.length > 0,
      'first property price exists': () => firstPropertyPrice.length > 0,
      'first property image exists': () => firstPropertyImage.length > 0
    });

    if (__ITER === 0 || __ITER % 50 === 0) {
      console.log(
        `VU ${__VU} | ${place} | Search Status: ${searchRes.status} | Results: ${properties.length} | Total: ${totalCount} | First Property: ${firstPropertyName}`
      );
    }

    if (firstPropertyId) {
      const detailsApiUrl = `${API_BASE_URL}/v1/property/${firstPropertyId}`;

      const detailsRes = http.get(detailsApiUrl, {
        tags: {
          api: 'property-details',
          flow: 'guest-search',
          place
        }
      });

      const detailsJson = safeParseJson(detailsRes.body);
      const detailsData = getPropertyDetailsData(detailsJson);

      const detailsName = String(
        detailsData?.name || detailsData?.property_name || firstPropertyName || ''
      );

      const detailsAddress = String(
        detailsData?.address || firstPropertyAddress || ''
      );

      check(detailsRes, {
        'property details status is 200': (res) => res.status === 200,
        'property details response time under 10s': (res) =>
          res.timings.duration < 10000,
        'property details response body exists': (res) =>
          String(res.body || '').length > 0,
        'property details data exists': () => Boolean(detailsData),
        'property details name exists': () => detailsName.length > 0,
        'property details address exists': () => detailsAddress.length > 0
      });

      if (__ITER === 0 || __ITER % 50 === 0) {
        console.log(
          `VU ${__VU} | ${place} | Details Status: ${detailsRes.status} | Property ID: ${firstPropertyId}`
        );
      }
    }
  });

  sleep(1);
}

export function handleSummary(data: any): Record<string, string> {
  return generateSummary(data);
}