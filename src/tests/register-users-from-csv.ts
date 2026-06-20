import http from 'k6/http';
import { check, group, sleep } from 'k6';
import exec from 'k6/execution';
import { SharedArray } from 'k6/data';

type RegisterUser = {
    email: string;
    first_name: string;
    last_name: string;
    password: string;
    role: string;
    question_answer_one: string;
    question_answer_two: string;
    question_answer_three: string;
};

const API_BASE_URL = 'https://dev-api.heyhomex.orangebd.com/api';

function loadCsvText(): string {
    const possiblePaths = [
        './src/data/register-users.csv',
        './register-users.csv',
        '../src/data/register-users.csv',
        '../register-users.csv',
        './data/register-users.csv',
        '../data/register-users.csv',
    ];

    for (const path of possiblePaths) {
        try {
            return open(path);
        } catch (e) {
            // try next path
        }
    }

    throw new Error('register-users.csv file not found. Put it in src/data/register-users.csv');
}

function parseCsv(csvText: string): RegisterUser[] {
    const lines = csvText
        .trim()
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length < 2) {
        throw new Error('CSV has no user rows.');
    }

    const headers = lines[0].split(',').map((h) => h.trim());

    return lines.slice(1).map((line) => {
        const values = line.split(',').map((v) => v.trim());
        const row: Record<string, string> = {};

        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });

        return row as RegisterUser;
    });
}

const users = new SharedArray<RegisterUser>('register users from csv', () => {
    return parseCsv(loadCsvText());
});

const VU_COUNT = 6;

export const options = {
    scenarios: {
        register_users_from_csv_parallel: {
            executor: 'per-vu-iterations',
            vus: VU_COUNT,
            iterations: 1,
            maxDuration: '5m',
        },
    },

    thresholds: {
        checks: ['rate>0.80'],
        http_req_failed: ['rate<0.50'],
        http_req_duration: ['p(95)<5000'],
    },
};

function apiUrl(path: string): string {
    return `${API_BASE_URL}${path}`;
}

function postForm(
    path: string,
    payload: Record<string, string>,
    token: string | null = null,
    tagName: string = path
) {
    const headers: Record<string, string> = {
        Accept: 'application/json',
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    return http.post(apiUrl(path), payload, {
        headers,
        tags: {
            name: tagName,
        },
    });
}

function isSuccess(res: any): boolean {
    try {
        const status = res.json('status');
        return status === 'success' || status === true;
    } catch (e) {
        return false;
    }
}

function safeJsonValue(res: any, key: string): string {
    try {
        const value = res.json(key);
        return value === undefined || value === null ? '' : String(value);
    } catch (e) {
        return '';
    }
}

function printFail(step: string, res: any) {
    if (!isSuccess(res) || res.status >= 400) {
        console.log(`❌ ${step} failed`);
        console.log(`Status: ${res.status}`);
        console.log(`Body: ${res.body}`);
    }
}

export default function () {
    // 6 VU = 6 users parallel
    // VU 1 uses CSV row 1, VU 2 uses CSV row 2, etc.
    const index = exec.vu.idInTest - 1;
    const user = users[index];

    if (!user) {
        console.log(`No CSV user found for VU index ${index}`);
        return;
    }

    let uuid = '';
    let otp = '';
    let token = '';

    console.log(`\n========== START USER: ${user.email} | ROLE: ${user.role} ==========`);

    group(`01_send_otp_${user.role}`, () => {
        const res = postForm(
            '/reg-otp-flow',
            {
                email: user.email,
            },
            null,
            'POST /reg-otp-flow'
        );

        printFail('OTP request', res);

        const passed = check(res, {
            'otp request status is 200': (r: any) => r.status === 200,
            'otp request success': (r: any) => isSuccess(r),
            'uuid exists': (r: any) => Boolean(safeJsonValue(r, 'data.uuid')),
            'otp exists': (r: any) => Boolean(safeJsonValue(r, 'data.otp')),
        });

        if (!passed) {
            throw new Error(`OTP request failed for ${user.email}`);
        }

        uuid = safeJsonValue(res, 'data.uuid');
        otp = safeJsonValue(res, 'data.otp');

        console.log(`[${user.email}] OTP received. UUID exists: ${Boolean(uuid)}`);
    });

    sleep(1);

    group(`02_verify_otp_${user.role}`, () => {
        const res = postForm(
            '/temp-reg/otp/verify',
            {
                uuid,
                auth_code: otp,
            },
            null,
            'POST /temp-reg/otp/verify'
        );

        printFail('OTP verify', res);

        const passed = check(res, {
            'otp verify status is 200': (r: any) => r.status === 200,
            'otp verify success': (r: any) => isSuccess(r),
        });

        if (!passed) {
            throw new Error(`OTP verify failed for ${user.email}`);
        }
    });

    sleep(1);

    group(`03_register_${user.role}`, () => {
        const res = postForm(
            '/register',
            {
                first_name: user.first_name,
                last_name: user.last_name,
                password: user.password,
                password_confirmation: user.password,
                uuid,
            },
            null,
            'POST /register'
        );

        printFail('Register', res);

        const passed = check(res, {
            'register status is 200 or 201': (r: any) =>
                r.status === 200 || r.status === 201,
            'register success': (r: any) => isSuccess(r),
        });

        if (!passed) {
            throw new Error(`Register failed for ${user.email}`);
        }
    });

    sleep(1);

    group(`04_login_${user.role}`, () => {
        const res = postForm(
            '/admin/login',
            {
                login_id: user.email,
                password: user.password,
            },
            null,
            'POST /admin/login'
        );

        printFail('Login', res);

        const passed = check(res, {
            'login status is 200': (r: any) => r.status === 200,
            'login success': (r: any) => isSuccess(r),
            'token exists': (r: any) => Boolean(safeJsonValue(r, 'data.token')),
        });

        if (!passed) {
            throw new Error(`Login failed for ${user.email}`);
        }

        token = safeJsonValue(res, 'data.token');

        console.log(`[${user.email}] Login done. Token length: ${token.length}`);
    });

    sleep(1);

    group(`05_onboard_${user.role}`, () => {
        const res = postForm(
            '/v1/user/onboard',
            {
                question_answer_one: user.question_answer_one,
                question_answer_two: user.question_answer_two,
                question_answer_three: user.question_answer_three,
            },
            token,
            'POST /v1/user/onboard'
        );

        printFail('Onboard', res);

        const passed = check(res, {
            'onboard status is 200': (r: any) => r.status === 200,
            'onboard success': (r: any) => isSuccess(r),
        });

        if (!passed) {
            throw new Error(`Onboard failed for ${user.email}`);
        }

        console.log(`[${user.email}] Onboard submitted as ${user.role}`);
    });

    console.log(`========== DONE USER: ${user.email} ==========\n`);

    sleep(1);
}