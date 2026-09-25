import { describe, expect, it } from 'vitest';
import { ApiError, errorText } from './api.ts';

describe('workspace API messages', () => {
  it('does not expose backend errors verbatim', () => {
    expect(errorText(new ApiError('permission_denied', 403))).toContain('keine Berechtigung');
    expect(errorText(new ApiError('database_password_leaked', 500))).toContain('nicht verfügbar');
  });
});
