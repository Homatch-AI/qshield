export interface QShieldConfig {
  apiPort: number;
  apiToken: string;
  enabled: boolean;
  autoInject: boolean;
  badgeStyle: 'compact' | 'banner';
}

export interface SignResponse {
  verificationId: string;
  verifyUrl: string;
  trustScore: number;
  trustLevel: string;
  badgeHtml: string;
  timestamp: string;
}

export interface HealthResponse {
  status: string;
  version: string;
  trustScore: number;
  trustLevel: string;
}

export interface StatusResponse {
  authenticated: boolean;
  edition: string;
  verificationsToday: number;
  dailyLimit: number;
}

export interface CreateSecureMessageResponse {
  messageId: string;
  shareUrl: string;
  expiresAt: string;
}

export interface UploadSecureFileResponse {
  fileId: string;
  shareUrl: string;
  expiresAt: string;
}

export const DEFAULT_CONFIG: QShieldConfig = {
  apiPort: 3847,
  apiToken: '',
  enabled: true,
  autoInject: true,
  badgeStyle: 'compact',
};
