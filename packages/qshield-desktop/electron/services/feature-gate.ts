/**
 * Semantic feature gate wrapper around LicenseManager.
 * Provides named checks for common feature gates.
 */
import { LicenseManager, type FeatureFlags, type LicenseTier } from './license-manager';

export class FeatureGate {
  constructor(private licenseManager: LicenseManager) {}

  canAddAdapter(currentCount: number): boolean {
    return currentCount < this.licenseManager.getLicense().features.maxAdapters;
  }

  canAddHighTrustAsset(currentCount: number): boolean {
    return currentCount < this.licenseManager.getLicense().features.maxHighTrustAssets;
  }

  canUseEmailNotifications(): boolean {
    return this.licenseManager.hasFeature('emailNotifications');
  }

  canGenerateFullReports(): boolean {
    return this.licenseManager.hasFeature('trustReports');
  }

  canGenerateAssetReports(): boolean {
    return this.licenseManager.hasFeature('assetReports');
  }

  getUpgradeMessage(feature: string): string {
    const tier = this.licenseManager.getTier();
    const messages: Record<string, string> = {
      emailNotifications: 'Email notifications require a Pro plan or higher.',
      trustReports: 'Full trust reports require a Pro plan or higher.',
      assetReports: 'Asset reports require a Business plan or higher.',
      apiAccess: 'API access requires a Business plan or higher.',
      maxHighTrustAssets: `You've reached the asset limit for your ${tier} plan. Upgrade for more.`,
      maxAdapters: `You've reached the adapter limit for your ${tier} plan. Upgrade for more.`,
    };
    return messages[feature] ?? `This feature requires a higher plan. Current plan: ${tier}.`;
  }

  getFeatures(): FeatureFlags {
    return this.licenseManager.getLicense().features;
  }

  getTier(): LicenseTier {
    return this.licenseManager.getTier();
  }
}
