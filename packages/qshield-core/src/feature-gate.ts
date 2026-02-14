import type { Feature, QShieldEdition, QShieldLicense, EditionLimits } from './license-types';
import { EDITION_LIMITS } from './license-types';
import { verifyLicenseSignature, isLicenseExpired } from './license-validator';

/**
 * Features available to unregistered users (no license at all).
 * Unregistered users see the static shield and trust score.
 */
const UNREGISTERED_FEATURES: Feature[] = ['shield_basic'];

/**
 * Runtime feature gate backed by a QShield license.
 *
 * When no license is set the gate behaves as "unregistered":
 * only shield_basic is available. When a free license is set,
 * all free-tier features become available.
 */
export class FeatureGate {
  private license: QShieldLicense | null = null;

  /**
   * Activate a license after signature verification.
   *
   * @param license - The license to activate
   * @returns True if the license was accepted, false if signature is invalid
   */
  setLicense(license: QShieldLicense): boolean {
    if (!verifyLicenseSignature(license)) return false;
    this.license = license;
    return true;
  }

  /** Remove the active license and revert to unregistered state. */
  clearLicense(): void {
    this.license = null;
  }

  /**
   * Check whether a specific feature is available.
   *
   * - No license (unregistered): only UNREGISTERED_FEATURES are available
   * - Expired license: falls back to unregistered features
   * - Valid license: checks against the license's feature list
   *
   * @param feature - The feature to check
   * @returns True if the feature is available
   */
  has(feature: Feature): boolean {
    if (!this.license || isLicenseExpired(this.license)) {
      return UNREGISTERED_FEATURES.includes(feature);
    }
    return this.license.features.includes(feature);
  }

  /** Return the current edition, or 'free' when unlicensed or expired. */
  edition(): QShieldEdition {
    if (!this.license || isLicenseExpired(this.license)) return 'free';
    return this.license.edition;
  }

  /** Return the current edition limits. Falls back to free limits. */
  limits(): EditionLimits {
    if (!this.license || isLicenseExpired(this.license)) return EDITION_LIMITS.free;
    return this.license.limits;
  }

  /**
   * Read a specific limit value.
   *
   * @param key - The limit key to read
   * @returns The limit value, or the free-tier default if unlicensed
   */
  limit(key: keyof EditionLimits): number {
    return this.limits()[key];
  }

  /**
   * Check if a limit is unlimited (-1 sentinel).
   *
   * @param key - The limit key to check
   * @returns True if the limit value is -1
   */
  isUnlimited(key: keyof EditionLimits): boolean {
    return this.limit(key) === -1;
  }

  /** True when a license is set and has not expired. */
  isActive(): boolean {
    if (!this.license) return false;
    return !isLicenseExpired(this.license);
  }

  /** Return the current license, or null if none is set. */
  getLicense(): QShieldLicense | null {
    return this.license;
  }
}

/** Singleton feature gate instance. */
export const featureGate = new FeatureGate();
