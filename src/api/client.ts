import { getToken } from '../auth.js';
import { BASE_URL } from '../config.js';

export class SessionBaseAPIError extends Error {
  constructor(
    message: string,
    public status?: number,
    public response?: Response
  ) {
    super(message);
    this.name = 'SessionBaseAPIError';
  }
}

/**
 * Make authenticated API requests to SessionBase
 */
export async function apiRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getToken();
  
  if (!token) {
    throw new SessionBaseAPIError(
      'Not authenticated. Please run `sessionbase login` first.'
    );
  }

  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;
  
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  
  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    
    try {
      const errorBody = await response.text();
      if (errorBody) {
        errorMessage += ` - ${errorBody}`;
      }
    } catch {
      // Ignore errors when reading error body
    }
    
    throw new SessionBaseAPIError(errorMessage, response.status, response);
  }

  return response;
}
