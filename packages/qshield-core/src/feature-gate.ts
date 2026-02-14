import type { Feature, QShieldEdition, QShieldLicense } from './license-types';
import { verifyLicenseSignature, isLicenseExpired } from './license-validator';

/**
 * Runtime feature gate backed by a QShield license.
 *
 * When no license is set the gate behaves as the "free" edition:
 * only baseline features are available.
 */
export class FeatureGate {
  private license: QShieldLicense | null = null;

  /**
   * Activate a license after signature verification.
   * If the signature is invalid the license is not stored.
   */
  setLicense(license: QShieldLicense): void {
    if (!verifyLicenseSignature(license)) return;
    this.license = license;
  }

  /** Remove the active license and revert to free edition. */
  clearLicense(): void {
    this.license = null;
  }

  /**
   * Check whether a specific feature is available.
   * Returns false when there is no license, the license is expired,
   * or the feature is not included in the license.
   */
  has(feature: Feature): boolean {
    if (!this.license) return false;
    if (isLicenseExpired(this.license)) return false;
    return this.license.features.includes(feature);
  }

  /** Return the current edition, or "free" when unlicensed. */
  edition(): QShieldEdition {
    if (!this.license) return 'free';
    return this.license.edition;
  }

  /**
   * Read a numeric limit from the license.
   * Returns undefined when the license is absent or the key is not set.
   */
  limit(key: string): number | undefined {
    if (!this.license?.limits) return undefined;
    return (this.license.limits as Record<string, number | undefined>)[key];
  }

  /** True when a license is set and has not expired. */
  isActive(): boolean {
    if (!this.license) return false;
    return !isLicenseExpired(this.license);
  }
}

/** Singleton feature gate instance. */
export const featureGate = new FeatureGate();
