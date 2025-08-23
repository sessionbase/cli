import { getToken } from '../utils/auth.js';
import { BASE_URL } from '../config.js';
import {
  SessionBaseAPIError,
  DeviceFlowResponse,
  DeviceTokenResponse,
  SessionUploadResponse,
  UserInfoResponse
} from './types.js';

/**
 * Unified SessionBase API client
 */
export class SessionBaseClient {
  private baseUrl: string;

  constructor(baseUrl: string = BASE_URL) {
    this.baseUrl = baseUrl;
  }

    /**
   * Start OAuth device flow
   */
  async startDeviceFlow(): Promise<DeviceFlowResponse> {
    const response = await this.fetch('/auth/device/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, false);

    return await response.json();
  }

  /**
   * Poll for device flow completion
   */
  async pollDeviceFlow(deviceCode: string): Promise<DeviceTokenResponse> {
    const response = await this.fetch('/auth/device/poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_code: deviceCode }),
    }, false);

    return await response.json();
  }

  /**
   * Get current user information
   */
  async getUserInfo(): Promise<UserInfoResponse> {
    const response = await this.fetch('/auth/me');
    return await response.json();
  }

  /**
   * Upload a session to SessionBase
   */
  async uploadSession(sessionData: any): Promise<SessionUploadResponse> {
    const response = await this.fetch('/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionData),
    });

    return await response.json();
  }

  /**
   * Make authenticated API calls
   */
  private async fetch(
    endpoint: string,
    options: RequestInit = {},
    requireAuth: boolean = true
  ): Promise<Response> {
    // Setup request
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    const headers = new Headers(options.headers);
    
    if (requireAuth) {
      const token = await getToken();
      if (!token) {
        throw new SessionBaseAPIError(
          'Not authenticated. Please run `sessionbase login` first.'
        );
      }
      headers.set('Authorization', `Bearer ${token}`);
    }

    // Retry wrapper
    return this.withRetry(async () => {
      const response = await fetch(url, { ...options, headers });
      
      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        const message = `HTTP ${response.status}: ${response.statusText}${errorBody ? ` - ${errorBody}` : ''}`;
        throw new SessionBaseAPIError(message, response.status, response);
      }
      
      return response;
    });
  }

  /**
   * Retry wrapper for network calls
   * https://www.backoff.dev/?base=100&factor=2&retries=2&strategy=none
   */
  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    const maxRetries = 2;
    const baseDelay = 100;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (error instanceof SessionBaseAPIError) {
          // Don't retry 4xx client errors
          if (error.status && error.status >= 400 && error.status < 500) {
            throw error;
          }
        }

        if (attempt === maxRetries) {
          throw error instanceof SessionBaseAPIError 
            ? error 
            : new SessionBaseAPIError(`Network request failed: ${error}`);
        }

        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new SessionBaseAPIError('Unexpected retry error');
  }
}

export const sessionBaseClient = new SessionBaseClient();
