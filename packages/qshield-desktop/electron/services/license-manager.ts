/**
 * License manager service — loads, validates, and persists QShield licenses.
 * Delegates runtime feature checks to the singleton featureGate from @qshield/core.
 */
import log from 'electron-log';
import {
  featureGate,
  verifyLicenseSignature,
  isLicenseExpired,
  EDITION_FEATURES,
  EDITION_LIMITS,
  type Feature,
  type QShieldEdition,
  type QShieldLicense,
} from '@qshield/core';
import type { ConfigManager } from './config';

export class LicenseManager {
  constructor(private config: ConfigManager) {}

  /** Load a persisted license from config and inject into the feature gate. */
  loadLicense(): void {
    const raw = this.config.get('license') as QShieldLicense | null;
    if (!raw) {
      log.info('[LicenseManager] No persisted license found');
      return;
    }

    if (!verifyLicenseSignature(raw)) {
      log.warn('[LicenseManager] Persisted license has invalid signature — ignoring');
      return;
    }

    if (isLicenseExpired(raw)) {
      log.warn('[LicenseManager] Persisted license is expired');
    }

    featureGate.setLicense(raw);
    log.info(`[LicenseManager] License loaded: edition=${raw.edition}, id=${raw.license_id}`);
  }

  /** Return the current license or null if none is active. */
  getLicense(): QShieldLicense | null {
    const raw = this.config.get('license') as QShieldLicense | null;
    return raw ?? null;
  }

  /**
   * Validate, persist, and activate a license.
   * @returns true if the license was accepted
   */
  setLicense(license: QShieldLicense): boolean {
    if (!verifyLicenseSignature(license)) {
      log.warn('[LicenseManager] Rejected license with invalid signature');
      return false;
    }

    this.config.set('license', license);
    featureGate.setLicense(license);
    log.info(`[LicenseManager] License set: edition=${license.edition}, id=${license.license_id}`);
    return true;
  }

  /** Remove the active license and clear persistence. */
  clearLicense(): void {
    this.config.set('license', null);
    featureGate.clearLicense();
    log.info('[LicenseManager] License cleared');
  }

  /**
   * Load a mock license for a given edition (dev/testing only).
   * Bypasses signature verification and injects directly into the feature gate.
   */
  loadMockLicense(edition: QShieldEdition): void {
    const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
    const license: QShieldLicense = {
      license_id: randomUUID(),
      edition,
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      features: EDITION_FEATURES[edition],
      limits: EDITION_LIMITS[edition],
      signature: `mock-dev-${edition}`,
    };
    this.config.set('license', license);
    featureGate.setLicense(license);
    log.info(`[LicenseManager] Mock ${edition} license loaded`);
  }

  /** Get the current edition (falls back to "free"). */
  getEdition(): QShieldEdition {
    return featureGate.edition();
  }

  /** Check whether a specific feature is available. */
  hasFeature(feature: Feature): boolean {
    return featureGate.has(feature);
  }
}
