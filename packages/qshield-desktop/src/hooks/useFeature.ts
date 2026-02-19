import type { Feature, QShieldEdition, FeatureFlags } from '@/stores/license-store';
import useLicenseStore from '@/stores/license-store';

/** Check whether a feature is enabled under the current license. */
export function useFeature(feature: Feature | keyof FeatureFlags): { enabled: boolean; edition: QShieldEdition } {
  const edition = useLicenseStore((s) => s.edition);
  const hasFeature = useLicenseStore((s) => s.hasFeature);
  return { enabled: hasFeature(feature), edition };
}
