import { useState } from 'react';
import { CertificateList } from '@/components/certificates/CertificateList';
import { CertificateExport } from '@/components/certificates/CertificateExport';

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
        <h1 className="text-2xl font-bold text-slate-100">Trust Certificates</h1>
        <p className="text-sm text-slate-400 mt-1">
          Generate and manage cryptographically signed trust certificates
        </p>
      </div>

      {/* Export Form */}
      {showExport && (
        <CertificateExport
          onClose={() => setShowExport(false)}
          onGenerated={handleGenerated}
        />
      )}

      {/* Certificate List */}
      <CertificateList
        key={refreshKey}
        onGenerateClick={() => setShowExport(true)}
      />
    </div>
  );
}
