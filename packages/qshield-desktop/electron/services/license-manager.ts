/**
 * License manager service — loads, validates, and persists QShield licenses.
 * Delegates runtime feature checks to the singleton featureGate from @qshield/core.
 */
import log from 'electron-log';
import {
  featureGate,
  verifyLicenseSignature,
  isLicenseExpired,
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

  /** Get the current edition (falls back to "personal"). */
  getEdition(): QShieldEdition {
    return featureGate.edition();
  }

  /** Check whether a specific feature is available. */
  hasFeature(feature: Feature): boolean {
    return featureGate.has(feature);
  }
}
