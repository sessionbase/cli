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

export interface DeviceFlowResponse {
  device_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}

export interface DeviceTokenResponse {
  status?: string;
  apiKey?: string;
  token?: string;
}

export interface SessionUploadResponse {
  id: string;
}

export interface UserInfoResponse {
  user?: {
    email?: string;
    name?: string;
    username?: string;
    provider?: string;
    createdAt?: string;
    userId?: string;
  };
  message?: string;
}