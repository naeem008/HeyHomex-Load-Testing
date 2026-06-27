const fs = require('fs');
const { spawnSync } = require('child_process');

const profile = process.argv[2] || process.env.PROFILE || 'custom-search-test';
const vus = process.argv[3] || process.env.VUS || '100';
const duration = process.argv[4] || process.env.DURATION || '2m';

const reportDir = `reports/k6/${profile}`;

fs.mkdirSync(reportDir, { recursive: true });

console.log('\n======================================');
console.log('HeyHomex k6 Guest Search Load Test');
console.log('======================================');
console.log(`Profile  : ${profile}`);
console.log(`VUs      : ${vus}`);
console.log(`Duration : ${duration}`);
console.log(`Report   : ${reportDir}`);
console.log('======================================\n');

const result = spawnSync(
    'k6',
    [
        'run',
        '-e',
        `PROFILE=${profile}`,
        '-e',
        `VUS=${vus}`,
        '-e',
        `DURATION=${duration}`,
        'dist/buyer-smoke-flow.js'
    ],
    {
        stdio: 'inherit',
        shell: true
    }
);

process.exit(result.status || 0);