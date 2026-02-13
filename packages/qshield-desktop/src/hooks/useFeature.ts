import type { Feature, QShieldEdition } from '@qshield/core';
import useLicenseStore from '@/stores/license-store';

/** Check whether a feature is enabled under the current license. */
export function useFeature(feature: Feature): { enabled: boolean; edition: QShieldEdition } {
  const edition = useLicenseStore((s) => s.edition);
  const hasFeature = useLicenseStore((s) => s.hasFeature);
  return { enabled: hasFeature(feature), edition };
}
