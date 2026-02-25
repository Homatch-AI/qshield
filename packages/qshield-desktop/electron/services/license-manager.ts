/**
 * Offline license key system with HMAC-SHA256 validation.
 * No backend required — keys are generated offline and validated locally.
 */
import { createHmac, randomBytes } from 'node:crypto';
import Store from 'electron-store';
import log from 'electron-log';

// ── Types ────────────────────────────────────────────────────────────────────

export type LicenseTier = 'trial' | 'personal' | 'pro' | 'business' | 'enterprise';

export interface FeatureFlags {
  maxAdapters: number;
  maxHighTrustAssets: number;
  emailNotifications: boolean;
  dailySummary: boolean;
  trustReports: boolean;
  assetReports: boolean;
  trustProfile: boolean;
  keyRotation: boolean;
  apiAccess: boolean;
  prioritySupport: boolean;
  customBranding: boolean;
}

export interface LicenseInfo {
  tier: LicenseTier;
  email: string;
  issuedAt: string;
  expiresAt: string;
  machineId: string;
  isValid: boolean;
  isExpired: boolean;
  daysRemaining: number;
  features: FeatureFlags;
}

// ── Feature maps ────────────────────────────────────────────────────────────

export const TIER_FEATURES: Record<LicenseTier, FeatureFlags> = {
  trial: {
    maxAdapters: 6,
    maxHighTrustAssets: 5,
    emailNotifications: true,
    dailySummary: true,
    trustReports: true,
    assetReports: true,
    trustProfile: true,
    keyRotation: false,
    apiAccess: false,
    prioritySupport: false,
    customBranding: false,
  },
  personal: {
    maxAdapters: 2,
    maxHighTrustAssets: 1,
    emailNotifications: false,
    dailySummary: false,
    trustReports: false,
    assetReports: false,
    trustProfile: true,
    keyRotation: false,
    apiAccess: false,
    prioritySupport: false,
    customBranding: false,
  },
  pro: {
    maxAdapters: 6,
    maxHighTrustAssets: 5,
    emailNotifications: true,
    dailySummary: true,
    trustReports: true,
    assetReports: false,
    trustProfile: true,
    keyRotation: false,
    apiAccess: false,
    prioritySupport: false,
    customBranding: false,
  },
  business: {
    maxAdapters: 6,
    maxHighTrustAssets: 999,
    emailNotifications: true,
    dailySummary: true,
    trustReports: true,
    assetReports: true,
    trustProfile: true,
    keyRotation: true,
    apiAccess: true,
    prioritySupport: true,
    customBranding: false,
  },
  enterprise: {
    maxAdapters: 6,
    maxHighTrustAssets: 999,
    emailNotifications: true,
    dailySummary: true,
    trustReports: true,
    assetReports: true,
    trustProfile: true,
    keyRotation: true,
    apiAccess: true,
    prioritySupport: true,
    customBranding: true,
  },
};

// ── Constants ────────────────────────────────────────────────────────────────

const TRIAL_DURATION_DAYS = 14;
const LICENSE_SIGNING_KEY = process.env.LICENSE_SIGNING_KEY ?? 'qshield-license-signing-key-v1';

interface LicenseStoreSchema {
  licenseKey: string | null;
  trialStartDate: string | null;
  machineId: string | null;
}

// ── LicenseManager ──────────────────────────────────────────────────────────

export class LicenseManager {
  private store: Store<LicenseStoreSchema>;
  private currentLicense: LicenseInfo;
  private machineId: string;

  constructor() {
    this.store = new Store<LicenseStoreSchema>({
      name: 'license',
      defaults: {
        licenseKey: null,
        trialStartDate: null,
        machineId: null,
      },
    });
    this.machineId = '';
    this.currentLicense = this.buildTrialLicense(0);
  }

  /** Initialize the license manager — load stored key or start/continue trial */
  initialize(): LicenseInfo {
    this.machineId = this.getOrCreateMachineId();

    const storedKey = this.store.get('licenseKey');
    if (storedKey) {
      try {
        this.currentLicense = this.validateKey(storedKey);
        log.info(`[LicenseManager] Loaded license: ${this.currentLicense.tier}, ${this.currentLicense.daysRemaining}d remaining`);
        return this.currentLicense;
      } catch (err) {
        log.warn(`[LicenseManager] Stored key invalid, clearing:`, err);
        this.store.set('licenseKey', null);
      }
    }

    // No valid key — use trial
    this.currentLicense = this.initTrial();
    return this.currentLicense;
  }

  /** Activate a license key — validate and store */
  activate(key: string): LicenseInfo {
    const license = this.validateKey(key);
    this.store.set('licenseKey', key);
    this.currentLicense = license;
    log.info(`[LicenseManager] Activated: ${license.tier}, expires ${license.expiresAt}`);
    return license;
  }

  /** Deactivate the current license — clear stored key, revert to trial */
  deactivate(): LicenseInfo {
    this.store.set('licenseKey', null);
    this.currentLicense = this.initTrial();
    log.info('[LicenseManager] Deactivated, reverted to trial');
    return this.currentLicense;
  }

  /** Get current license state */
  getLicense(): LicenseInfo {
    // Refresh expiry check
    if (this.currentLicense.tier === 'trial') {
      this.currentLicense = this.initTrial();
    }
    return this.currentLicense;
  }

  /** Check if a feature is enabled */
  hasFeature(feature: keyof FeatureFlags): boolean {
    const value = this.currentLicense.features[feature];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value > 0;
    return false;
  }

  /** Get current tier */
  getTier(): LicenseTier {
    return this.currentLicense.tier;
  }

  /** Check if currently on trial */
  isTrial(): boolean {
    return this.currentLicense.tier === 'trial';
  }

  /** Check if trial/license has expired */
  isExpired(): boolean {
    return this.currentLicense.isExpired;
  }

  // ── Key generation (dev/admin) ──────────────────────────────────────────

  /** Generate a license key for testing or distribution */
  static generateKey(opts: {
    tier: string;
    email?: string;
    durationDays?: number;
  }): string {
    const tier = opts.tier as LicenseTier;
    if (!TIER_FEATURES[tier]) throw new Error(`Invalid tier: ${tier}`);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + (opts.durationDays ?? 365) * 86_400_000);

    const payload = {
      tier,
      email: opts.email ?? 'user@qshield.app',
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    const jsonData = JSON.stringify(payload);
    const signature = createHmac('sha256', LICENSE_SIGNING_KEY)
      .update(jsonData)
      .digest('hex')
      .slice(0, 16);

    const combined = `${jsonData}.${signature}`;
    const encoded = Buffer.from(combined).toString('base64url');

    return `QS-${tier.toUpperCase()}-${now.getFullYear()}-${encoded}`;
  }

  // ── Private methods ────────────────────────────────────────────────────

  private validateKey(key: string): LicenseInfo {
    // Parse key format: QS-{TIER}-{YEAR}-{PAYLOAD}
    const parts = key.split('-');
    if (parts.length < 4 || parts[0] !== 'QS') {
      throw new Error('Invalid key format');
    }

    // Payload is everything after the third dash
    const payloadEncoded = parts.slice(3).join('-');
    let payloadStr: string;
    try {
      payloadStr = Buffer.from(payloadEncoded, 'base64url').toString('utf-8');
    } catch {
      throw new Error('Invalid key encoding');
    }

    const dotIndex = payloadStr.lastIndexOf('.');
    if (dotIndex === -1) throw new Error('Invalid key structure');

    const jsonData = payloadStr.slice(0, dotIndex);
    const signature = payloadStr.slice(dotIndex + 1);

    // Verify HMAC signature
    const expectedSig = createHmac('sha256', LICENSE_SIGNING_KEY)
      .update(jsonData)
      .digest('hex')
      .slice(0, 16);

    if (signature !== expectedSig) {
      throw new Error('Invalid key signature');
    }

    // Parse payload
    let payload: { tier: LicenseTier; email: string; issuedAt: string; expiresAt: string };
    try {
      payload = JSON.parse(jsonData);
    } catch {
      throw new Error('Invalid key data');
    }

    const tier = payload.tier;
    if (!TIER_FEATURES[tier]) throw new Error(`Unknown tier: ${tier}`);

    const expiresAt = new Date(payload.expiresAt);
    const now = new Date();
    const msRemaining = expiresAt.getTime() - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(msRemaining / 86_400_000));
    const isExpired = msRemaining <= 0;

    return {
      tier,
      email: payload.email,
      issuedAt: payload.issuedAt,
      expiresAt: payload.expiresAt,
      machineId: this.machineId,
      isValid: !isExpired,
      isExpired,
      daysRemaining,
      features: isExpired ? TIER_FEATURES.personal : TIER_FEATURES[tier],
    };
  }

  private initTrial(): LicenseInfo {
    let trialStart = this.store.get('trialStartDate');
    if (!trialStart) {
      trialStart = new Date().toISOString();
      this.store.set('trialStartDate', trialStart);
      log.info('[LicenseManager] Trial started');
    }

    const startDate = new Date(trialStart);
    const expiresAt = new Date(startDate.getTime() + TRIAL_DURATION_DAYS * 86_400_000);
    const now = new Date();
    const msRemaining = expiresAt.getTime() - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(msRemaining / 86_400_000));
    const isExpired = msRemaining <= 0;

    return this.buildTrialLicense(daysRemaining, trialStart, expiresAt.toISOString(), isExpired);
  }

  private buildTrialLicense(
    daysRemaining: number,
    issuedAt = new Date().toISOString(),
    expiresAt = new Date(Date.now() + TRIAL_DURATION_DAYS * 86_400_000).toISOString(),
    isExpired = false,
  ): LicenseInfo {
    return {
      tier: 'trial',
      email: '',
      issuedAt,
      expiresAt,
      machineId: this.machineId,
      isValid: !isExpired,
      isExpired,
      daysRemaining,
      features: isExpired ? TIER_FEATURES.personal : TIER_FEATURES.trial,
    };
  }

  private getOrCreateMachineId(): string {
    // Try stored machine ID first
    const stored = this.store.get('machineId');
    if (stored) return stored;

    // Try node-machine-id
    try {
      const { machineIdSync } = require('node-machine-id');
      const id = machineIdSync(true);
      this.store.set('machineId', id);
      return id;
    } catch {
      // Fallback to random ID
      const id = randomBytes(16).toString('hex');
      this.store.set('machineId', id);
      log.warn('[LicenseManager] Using random machine ID (node-machine-id unavailable)');
      return id;
    }
  }
}
