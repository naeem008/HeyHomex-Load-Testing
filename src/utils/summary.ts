import { PROFILE } from './config';

function metricValue(data: any, metricName: string, key: string): string {
  const metric = data.metrics?.[metricName];

  if (!metric || !metric.values || metric.values[key] === undefined) {
    return 'N/A';
  }

  return String(metric.values[key]);
}

function htmlReport(data: any): string {
  const totalRequests = metricValue(data, 'http_reqs', 'count');
  const failedRate = metricValue(data, 'http_req_failed', 'rate');
  const avgDuration = metricValue(data, 'http_req_duration', 'avg');
  const p95Duration = metricValue(data, 'http_req_duration', 'p(95)');
  const checkRate = metricValue(data, 'checks', 'rate');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>HeyHomex k6 Report - ${PROFILE}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; }
    h1 { margin-bottom: 4px; }
    table { border-collapse: collapse; width: 700px; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
    th { background: #f4f4f4; }
  </style>
</head>
<body>
  <h1>HeyHomex k6 Performance Report</h1>
  <p>Profile: <strong>${PROFILE}</strong></p>

  <table>
    <tr><th>Metric</th><th>Value</th></tr>
    <tr><td>Total Requests</td><td>${totalRequests}</td></tr>
    <tr><td>Failed Request Rate</td><td>${failedRate}</td></tr>
    <tr><td>Average Response Time</td><td>${avgDuration} ms</td></tr>
    <tr><td>P95 Response Time</td><td>${p95Duration} ms</td></tr>
    <tr><td>Check Pass Rate</td><td>${checkRate}</td></tr>
  </table>
</body>
</html>
`;
}

export function generateSummary(data: any): Record<string, string> {
  return {
    [`reports/k6/${PROFILE}/summary.json`]: JSON.stringify(data, null, 2),
    [`reports/k6/${PROFILE}/summary.html`]: htmlReport(data),
    stdout: `\nHeyHomex ${PROFILE} test completed. Report saved in reports/k6/${PROFILE}/\n`
  };
}