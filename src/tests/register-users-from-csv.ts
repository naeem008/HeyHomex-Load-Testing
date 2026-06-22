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

type UserType = {
  id?: number;
  name?: string;
  slug?: string;
};

type UserPreference = {
  id?: number;
  question_minimum_price?: string | null;
  question_maximum_price?: string | null;
  range_minimum_price?: string | null;
  range_maximum_price?: string | null;
  question_location?: string | null;
};

type UserData = {
  id?: number;
  email?: string;
  token?: string;
  user_type?: UserType | UserType[];
  current_user_type?: UserType | null;
  user_preference?: UserPreference | null;
  user_onboard_profile_status?: number | string | boolean;
  profile_questions_answers?: unknown[];
};

type ApiResponse<T> = {
  status?: string | boolean;
  message?: string;
  data?: T;
};

type OtpData = {
  uuid?: string;
  email?: string;
  otp?: string | number;
};

const API_BASE_URL = (
  __ENV.BASE_URL ||
  'https://dev-api.heyhomex.orangebd.com/api'
).replace(/\/+$/, '');

const DASHBOARD_PATH = (
  __ENV.DASHBOARD_PATH || ''
).trim();

function loadCsv(): string {
  const paths = [
    '../src/data/register-users.csv',
    './src/data/register-users.csv',
    './data/register-users.csv',
    '../data/register-users.csv',
  ];

  for (const path of paths) {
    try {
      return open(path);
    } catch {
      // Try next CSV path.
    }
  }

  throw new Error(
    'CSV not found: src/data/register-users.csv'
  );
}

function parseCsv(
  text: string
): RegisterUser[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error(
      'CSV has no user rows.'
    );
  }

  const headers = lines[0]
    .split(',')
    .map((item) => item.trim());

  const required:
    Array<keyof RegisterUser> = [
      'email',
      'first_name',
      'last_name',
      'password',
      'role',
      'question_answer_one',
      'question_answer_two',
      'question_answer_three',
    ];

  required.forEach((key) => {
    if (!headers.includes(key)) {
      throw new Error(
        'Missing CSV column: ' + key
      );
    }
  });

  return lines
    .slice(1)
    .map((line, rowIndex) => {
      const values = line
        .split(',')
        .map((item) => item.trim());

      const row:
        Record<string, string> = {};

      headers.forEach(
        (header, index) => {
          row[header] =
            values[index] || '';
        }
      );

      const user =
        row as RegisterUser;

      required.forEach((key) => {
        if (!user[key]) {
          throw new Error(
            'CSV row ' +
              (rowIndex + 2) +
              ' empty: ' +
              key
          );
        }
      });

      return user;
    });
}

const users =
  new SharedArray<RegisterUser>(
    'register users',
    () => parseCsv(loadCsv())
  );

const requestedVus = Number(
  __ENV.VUS || users.length
);

const VU_COUNT =
  Number.isFinite(requestedVus) &&
  requestedVus > 0
    ? Math.min(
        Math.floor(requestedVus),
        users.length
      )
    : users.length;

export const options = {
  scenarios: {
    register_login_onboard_from_csv: {
      executor: 'per-vu-iterations',
      vus: VU_COUNT,
      iterations: 1,
      maxDuration: '5m',
    },
  },

  thresholds: {
    checks: ['rate>0.95'],
    http_req_failed: ['rate<0.10'],
    http_req_duration: ['p(95)<5000'],
  },
};

function apiUrl(
  path: string
): string {
  const finalPath =
    path.startsWith('/')
      ? path
      : '/' + path;

  return API_BASE_URL + finalPath;
}

function makeMultipart(
  payload: Record<string, string>
): {
  body: string;
  contentType: string;
} {
  const boundary =
    '----k6' +
    __VU +
    __ITER +
    Date.now() +
    Math.random()
      .toString(16)
      .slice(2);

  let body = '';

  Object.entries(payload).forEach(
    ([key, value]) => {
      body +=
        '--' + boundary + '\r\n';

      body +=
        'Content-Disposition: ' +
        'form-data; name="' +
        key +
        '"\r\n\r\n';

      body += value + '\r\n';
    }
  );

  body +=
    '--' + boundary + '--\r\n';

  return {
    body,
    contentType:
      'multipart/form-data; boundary=' +
      boundary,
  };
}

function postForm(
  path: string,
  payload: Record<string, string>,
  token: string | null,
  tagName: string
): any {
  const form =
    makeMultipart(payload);

  const headers:
    Record<string, string> = {
      Accept: 'application/json',
      'Content-Type':
        form.contentType,
    };

  if (token) {
    headers.Authorization =
      'Bearer ' + token;
  }

  return http.post(
    apiUrl(path),
    form.body,
    {
      headers,

      tags: {
        name: tagName,
        endpoint: path,
      },
    }
  );
}

function getAuthorized(
  path: string,
  token: string
): any {
  return http.get(
    apiUrl(path),
    {
      headers: {
        Accept:
          'application/json',

        Authorization:
          'Bearer ' + token,
      },

      tags: {
        name: 'GET ' + path,
        endpoint: path,
      },
    }
  );
}

function parseJson<T>(
  res: any
): ApiResponse<T> | null {
  try {
    return (
      res.json() as ApiResponse<T>
    );
  } catch {
    return null;
  }
}

function isSuccess<T>(
  body: ApiResponse<T> | null
): boolean {
  return (
    body?.status === 'success' ||
    body?.status === true
  );
}

function normalizeRole(
  value: string
): string {
  const role = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  if (role === 'kamaina') {
    return 'kamaaina';
  }

  return role;
}

function extractRole(
  data: UserData | undefined
): string {
  if (!data) {
    return '';
  }

  if (
    data.current_user_type?.slug
  ) {
    return (
      data.current_user_type.slug
    );
  }

  if (
    data.current_user_type?.name
  ) {
    return (
      data.current_user_type.name
    );
  }

  if (
    Array.isArray(data.user_type)
  ) {
    return (
      data.user_type[0]?.slug ||
      data.user_type[0]?.name ||
      ''
    );
  }

  return (
    data.user_type?.slug ||
    data.user_type?.name ||
    ''
  );
}

function preferenceSaved(
  value:
    | UserPreference
    | null
    | undefined
): boolean {
  if (!value) {
    return false;
  }

  return Boolean(
    value.id ||
      value
        .question_minimum_price ||
      value
        .question_maximum_price ||
      value
        .range_minimum_price ||
      value
        .range_maximum_price ||
      value.question_location
  );
}

function onboardingComplete(
  value: unknown
): boolean {
  return (
    value === 1 ||
    value === '1' ||
    value === true ||
    value === 'true'
  );
}

function stopFlow(
  step: string,
  email: string,
  res: any
): never {
  console.error(
    'FAILED: ' +
      step +
      ' | ' +
      email
  );

  console.error(
    'HTTP status: ' +
      String(
        res?.status || 'unknown'
      )
  );

  console.error(
    'Response: ' +
      String(res?.body || '')
  );

  throw new Error(
    step +
      ' failed for ' +
      email
  );
}

export default function (): void {
  const user =
    users[
      exec.vu.idInTest - 1
    ];

  if (!user) {
    throw new Error(
      'No CSV user for this VU.'
    );
  }

  let uuid = '';
  let otp = '';
  let token = '';

  console.log(
    'START: ' +
      user.email +
      ' | role: ' +
      user.role
  );

  group(
    '01_send_otp_' +
      user.role,
    () => {
      const res = postForm(
        '/reg-otp-flow',
        {
          email: user.email,
        },
        null,
        'POST /reg-otp-flow'
      );

      const body =
        parseJson<OtpData>(res);

      const data =
        body?.data;

      const passed =
        check(res, {
          'otp request status is 200':
            () =>
              res.status === 200,

          'otp request success':
            () =>
              isSuccess(body),

          'otp email matches CSV':
            () =>
              data?.email ===
              user.email,

          'uuid exists':
            () =>
              Boolean(
                data?.uuid
              ),

          'otp exists':
            () =>
              data?.otp !==
                undefined &&
              data?.otp !== null,
        });

      if (
        !passed ||
        !data?.uuid ||
        data.otp === undefined ||
        data.otp === null
      ) {
        stopFlow(
          'OTP request',
          user.email,
          res
        );
      }

      uuid =
        String(data.uuid);

      otp =
        String(data.otp);

      console.log(
        'OTP captured: ' +
          user.email
      );
    }
  );

  sleep(1);

  group(
    '02_verify_otp_' +
      user.role,
    () => {
      const res = postForm(
        '/temp-reg/otp/verify',
        {
          uuid,
          auth_code: otp,
        },
        null,
        'POST /temp-reg/otp/verify'
      );

      const body =
        parseJson<
          Record<
            string,
            unknown
          >
        >(res);

      const passed =
        check(res, {
          'otp verify status is 200':
            () =>
              res.status === 200,

          'otp verify success':
            () =>
              isSuccess(body),
        });

      if (!passed) {
        stopFlow(
          'OTP verification',
          user.email,
          res
        );
      }

      console.log(
        'OTP verified: ' +
          user.email
      );
    }
  );

  sleep(1);

  group(
    '03_register_' +
      user.role,
    () => {
      const res = postForm(
        '/register',
        {
          first_name:
            user.first_name,

          last_name:
            user.last_name,

          password:
            user.password,

          password_confirmation:
            user.password,

          uuid,
        },
        null,
        'POST /register'
      );

      const body =
        parseJson<UserData>(res);

      const passed =
        check(res, {
          'register status is 200 or 201':
            () =>
              res.status === 200 ||
              res.status === 201,

          'register success':
            () =>
              isSuccess(body),

          'registered user id exists':
            () =>
              Boolean(
                body?.data?.id
              ),
        });

      if (!passed) {
        stopFlow(
          'Registration',
          user.email,
          res
        );
      }

      console.log(
        'Registered: ' +
          user.email
      );
    }
  );

  sleep(1);

  group(
    '04_login_' +
      user.role,
    () => {
      const res = postForm(
        '/admin/login',
        {
          login_id:
            user.email,

          password:
            user.password,
        },
        null,
        'POST /admin/login'
      );

      const body =
        parseJson<UserData>(res);

      const passed =
        check(res, {
          'login status is 200':
            () =>
              res.status === 200,

          'login success':
            () =>
              isSuccess(body),

          'login token exists':
            () =>
              Boolean(
                body?.data?.token
              ),
        });

      if (
        !passed ||
        !body?.data?.token
      ) {
        stopFlow(
          'Login',
          user.email,
          res
        );
      }

      token =
        String(
          body.data.token
        );

      console.log(
        'Logged in: ' +
          user.email
      );
    }
  );

  sleep(1);

  group(
    '05_onboard_' +
      user.role,
    () => {
      const res = postForm(
        '/v1/user/onboard',
        {
          question_answer_one:
            user
              .question_answer_one,

          question_answer_two:
            user
              .question_answer_two,

          question_answer_three:
            user
              .question_answer_three,
        },
        token,
        'POST /v1/user/onboard'
      );

      const body =
        parseJson<UserData>(res);

      const role =
        extractRole(body?.data);

      const passed =
        check(res, {
          'onboard status is 200':
            () =>
              res.status === 200,

          'onboard success':
            () =>
              isSuccess(body),

          'onboard role exists':
            () =>
              Boolean(role),

          'onboard role matches CSV':
            () =>
              normalizeRole(role) ===
              normalizeRole(
                user.role
              ),

          'onboard preference exists':
            () =>
              body?.data
                ?.user_preference ===
                undefined ||
              preferenceSaved(
                body.data
                  .user_preference
              ),
        });

      if (!passed) {
        stopFlow(
          'Onboarding',
          user.email,
          res
        );
      }

      const status =
        body?.data
          ?.user_onboard_profile_status;

      if (
        !onboardingComplete(status)
      ) {
        console.warn(
          'Backend warning: ' +
            'onboard status is ' +
            String(status) +
            ' for ' +
            user.email
        );
      }

      console.log(
        'Onboarded: ' +
          user.email +
          ' | role: ' +
          role
      );
    }
  );

  sleep(2);

  group(
    '06_verify_' +
      user.role,
    () => {
      const res = postForm(
        '/admin/login',
        {
          login_id:
            user.email,

          password:
            user.password,
        },
        null,
        'POST /admin/login after onboarding'
      );

      const body =
        parseJson<UserData>(res);

      const role =
        extractRole(body?.data);

      const prefSaved =
        preferenceSaved(
          body?.data
            ?.user_preference
        );

      const status =
        body?.data
          ?.user_onboard_profile_status;

      const answerCount =
        body?.data
          ?.profile_questions_answers
          ?.length || 0;

      const passed =
        check(res, {
          'final login status is 200':
            () =>
              res.status === 200,

          'final login success':
            () =>
              isSuccess(body),

          'final login token exists':
            () =>
              Boolean(
                body?.data?.token
              ),

          'final role matches CSV':
            () =>
              normalizeRole(role) ===
              normalizeRole(
                user.role
              ),

          'preference is saved':
            () =>
              prefSaved,
        });

      if (
        !passed ||
        !body?.data?.token
      ) {
        stopFlow(
          'Final verification',
          user.email,
          res
        );
      }

      token =
        String(
          body.data.token
        );

      if (
        !onboardingComplete(status)
      ) {
        console.warn(
          'Backend warning: ' +
            'final onboard status is ' +
            String(status) +
            ' for ' +
            user.email
        );
      }

      if (
        answerCount === 0
      ) {
        console.warn(
          'Backend warning: ' +
            'profile_questions_answers ' +
            'is empty for ' +
            user.email
        );
      }

      console.log(
        'Verified: ' +
          user.email +
          ' | role: ' +
          role +
          ' | preference: ' +
          String(prefSaved)
      );
    }
  );

  sleep(1);

  if (DASHBOARD_PATH) {
    group(
      '07_dashboard_' +
        user.role,
      () => {
        const res =
          getAuthorized(
            DASHBOARD_PATH,
            token
          );

        const passed =
          check(res, {
            'dashboard status is 200':
              () =>
                res.status === 200,

            'dashboard response exists':
              () =>
                Boolean(
                  res.body
                ),
          });

        if (!passed) {
          stopFlow(
            'Dashboard API',
            user.email,
            res
          );
        }
      }
    );
  }

  console.log(
    'DONE: ' +
      user.email +
      ' | role: ' +
      user.role
  );

  sleep(1);
}

