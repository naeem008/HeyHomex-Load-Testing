export function generateSummary(data: any): Record<string, string> {
  const profile = __ENV.PROFILE || 'default';
  const reportDir = `reports/k6/${profile}`;

  const totalRequests = data.metrics.http_reqs?.values?.count ?? 0;
  const failedRate = data.metrics.http_req_failed?.values?.rate ?? 0;
  const avgResponseTime = data.metrics.http_req_duration?.values?.avg ?? 0;
  const p95ResponseTime = data.metrics.http_req_duration?.values?.['p(95)'] ?? 0;
  const p90ResponseTime = data.metrics.http_req_duration?.values?.['p(90)'] ?? 0;
  const maxResponseTime = data.metrics.http_req_duration?.values?.max ?? 0;
  const checkPassRate = data.metrics.checks?.values?.rate ?? 0;
  const iterations = data.metrics.iterations?.values?.count ?? 0;
  const interruptedIterations =
    data.metrics.interrupted_iterations?.values?.count ?? 0;
  const vusMax = data.metrics.vus_max?.values?.value ?? 0;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>HeyHomex k6 Report - ${profile}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 40px;
      color: #111;
    }
    h1 {
      margin-bottom: 10px;
    }
    table {
      border-collapse: collapse;
      width: 760px;
      margin-top: 20px;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 12px;
      text-align: left;
    }
    th {
      background: #f4f4f4;
    }
    .pass {
      color: green;
      font-weight: bold;
    }
    .fail {
      color: red;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <h1>HeyHomex k6 Performance Report</h1>
  <p><strong>Profile:</strong> ${profile}</p>

  <table>
    <tr><th>Metric</th><th>Value</th></tr>
    <tr><td>Total Requests</td><td>${totalRequests}</td></tr>
    <tr><td>Failed Request Rate</td><td>${(failedRate * 100).toFixed(2)}%</td></tr>
    <tr><td>Average Response Time</td><td>${avgResponseTime.toFixed(2)} ms</td></tr>
    <tr><td>P90 Response Time</td><td>${p90ResponseTime.toFixed(2)} ms</td></tr>
    <tr><td>P95 Response Time</td><td>${p95ResponseTime.toFixed(2)} ms</td></tr>
    <tr><td>Max Response Time</td><td>${maxResponseTime.toFixed(2)} ms</td></tr>
    <tr><td>Check Pass Rate</td><td>${(checkPassRate * 100).toFixed(2)}%</td></tr>
    <tr><td>Completed Iterations</td><td>${iterations}</td></tr>
    <tr><td>Interrupted Iterations</td><td>${interruptedIterations}</td></tr>
    <tr><td>Max VUs</td><td>${vusMax}</td></tr>
  </table>

  <h2>Quick Result</h2>
  <p>
    HTTP Failure:
    <span class="${failedRate < 0.1 ? 'pass' : 'fail'}">
      ${failedRate < 0.1 ? 'PASS' : 'FAIL'}
    </span>
  </p>
  <p>
    P95 Response Time:
    <span class="${p95ResponseTime < 10000 ? 'pass' : 'fail'}">
      ${p95ResponseTime < 10000 ? 'PASS' : 'FAIL'}
    </span>
  </p>
  <p>
    Check Pass Rate:
    <span class="${checkPassRate > 0.9 ? 'pass' : 'fail'}">
      ${checkPassRate > 0.9 ? 'PASS' : 'FAIL'}
    </span>
  </p>
</body>
</html>
`;

  const consoleSummary = `
========== HeyHomex k6 Summary ==========
Profile                  : ${profile}
Total Requests           : ${totalRequests}
Failed Request Rate      : ${(failedRate * 100).toFixed(2)}%
Average Response Time    : ${avgResponseTime.toFixed(2)} ms
P90 Response Time        : ${p90ResponseTime.toFixed(2)} ms
P95 Response Time        : ${p95ResponseTime.toFixed(2)} ms
Max Response Time        : ${maxResponseTime.toFixed(2)} ms
Check Pass Rate          : ${(checkPassRate * 100).toFixed(2)}%
Completed Iterations     : ${iterations}
Interrupted Iterations   : ${interruptedIterations}
Max VUs                  : ${vusMax}
==========================================
Report saved in ${reportDir}/
`;

  return {
    stdout: consoleSummary,
    [`${reportDir}/summary.html`]: html,
    [`${reportDir}/summary.json`]: JSON.stringify(data, null, 2)
  };
}