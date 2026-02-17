import { useState } from 'react';
import { ReportList } from '@/components/certificates/ReportList';
import { GenerateReport } from '@/components/certificates/GenerateReport';

/**
 * Trust Reports page with report list and generate form toggle.
 */
export default function CertificatesPage() {
  const [showExport, setShowExport] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleGenerated = () => {
    setShowExport(false);
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Trust Reports</h1>
        <p className="text-sm text-slate-400 mt-1">
          Generate verifiable trust reports for audits, compliance, and stakeholders
        </p>
      </div>

      {/* Generate Report Form */}
      {showExport && (
        <GenerateReport
          onClose={() => setShowExport(false)}
          onGenerated={handleGenerated}
        />
      )}

      {/* Report List */}
      <ReportList
        key={refreshKey}
        onGenerateClick={() => setShowExport(true)}
      />
    </div>
  );
}
