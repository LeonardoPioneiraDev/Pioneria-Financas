import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

const TOKEN_KEY = 'pioneira:access_token';
const REFRESH_KEY = 'pioneira:refresh_token';

export const tokenStorage = {
  getAccess(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(TOKEN_KEY);
  },
  getRefresh(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(TOKEN_KEY, access);
    window.localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear(): void {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
  },
};

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
});

// Endpoints longos (sync com Oracle/Globus) têm timeout maior.
// FLP é o mais pesado (~30k upserts/competência): 15 minutos.
const TIMEOUTS_LONGOS: Array<{ pattern: RegExp; timeoutMs: number }> = [
  { pattern: /\/folha-detalhe\/sync/, timeoutMs: 15 * 60_000 },
  // Cobre tanto `/sync` quanto `/sincronizar` (depreciação usa o segundo — o
  // padrão antigo só pegava "/sync" e o sync da depreciação caía no timeout curto).
  { pattern: /\/(sync|sincronizar)($|\?)/, timeoutMs: 5 * 60_000 },
  { pattern: /\/sumario/, timeoutMs: 60_000 },
];

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStorage.getAccess();
  if (token && config.headers) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  const url = config.url ?? '';
  for (const { pattern, timeoutMs } of TIMEOUTS_LONGOS) {
    if (pattern.test(url)) {
      config.timeout = timeoutMs;
      break;
    }
  }
  return config;
});

let refreshInFlight: Promise<string | null> | null = null;

async function tentarRefresh(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  const refresh = tokenStorage.getRefresh();
  if (!refresh) return null;

  refreshInFlight = axios
    .post(`${API_BASE_URL}/api/auth/refresh`, { refreshToken: refresh })
    .then((res) => {
      const { accessToken, refreshToken } = res.data as { accessToken: string; refreshToken: string };
      tokenStorage.set(accessToken, refreshToken);
      return accessToken;
    })
    .catch(() => {
      tokenStorage.clear();
      return null;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retry && !original.url?.includes('/auth/')) {
      original._retry = true;
      const novoToken = await tentarRefresh();
      if (novoToken && original.headers) {
        original.headers.set('Authorization', `Bearer ${novoToken}`);
        return api.request(original);
      }
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.replace('/login');
      }
    }
    return Promise.reject(error);
  },
);

export function extrairMensagemErro(err: unknown, fallback = 'Algo deu errado. Tente novamente.'): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string } | undefined;
    return data?.message ?? err.message ?? fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
