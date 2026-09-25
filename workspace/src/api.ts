export type Organization = {
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
};

export type Session = {
  authenticated: boolean;
  csrfToken: string;
  user?: { id: string; fullName: string; email: string };
  organizations?: Organization[];
  activeOrganization?: Organization | null;
};

export class ApiError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
  }
}

let csrfToken = '';

export function updateCsrfToken(token: string): void {
  csrfToken = token;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && csrfToken) {
    headers.set('X-CSRF-Token', csrfToken);
  }

  const response = await fetch(`/api/v1${path}`, {
    ...init,
    method,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('firmspace-auth-expired'));
    throw new ApiError(typeof payload.error === 'string' ? payload.error : 'request_failed', response.status);
  }
  return payload as T;
}

export const errorText = (error: unknown): string => {
  if (!(error instanceof ApiError)) return 'Die Anfrage konnte nicht abgeschlossen werden. Bitte versuchen Sie es erneut.';
  if (error.status === 429) return 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.';
  switch (error.code) {
    case 'invalid_input':
    case 'invalid_request': return 'Bitte prüfen Sie Ihre Eingaben.';
    case 'invalid_credentials': return 'E-Mail-Adresse oder Passwort sind nicht korrekt.';
    case 'email_already_registered': return 'Für diese E-Mail-Adresse besteht bereits ein Konto. Bitte melden Sie sich an.';
    case 'permission_denied': return 'Sie haben für diese Änderung keine Berechtigung.';
    case 'organization_access_required': return 'Auf diese Organisation besteht kein Zugriff.';
    case 'csrf_validation_failed':
    case 'origin_not_allowed': return 'Die Sitzung ist abgelaufen. Bitte laden Sie die Seite neu.';
    default: return 'Der Dienst ist gerade nicht verfügbar. Bitte versuchen Sie es später erneut.';
  }
};
