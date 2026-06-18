import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { getOptions, BASE_URL } from '../utils/config';
import { generateSummary } from '../utils/summary';

export const options = getOptions();

export default function (): void {
  group('HeyHomex homepage check', () => {
    const response = http.get(BASE_URL, {
      tags: {
        page: 'homepage'
      }
    });

    check(response, {
      'homepage status is 200': (res) => res.status === 200,
      'homepage response time is under 3s': (res) => res.timings.duration < 3000
    });
  });

  sleep(1);
}

export function handleSummary(data: any): Record<string, string> {
  return generateSummary(data);
}