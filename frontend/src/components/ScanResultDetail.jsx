import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getScanResult } from '../api/fileApi';

function getThreatClass(level) {
  return (level || 'none').toLowerCase();
}

export default function ScanResultDetail() {
  const { fileId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await getScanResult(fileId);
        setData(result);
      } catch (err) {
        setError(err.message || 'Failed to load scan result.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [fileId]);

  if (loading) {
    return <div className="loading"><div className="spinner"></div> Loading scan result...</div>;
  }

  if (error) {
    return (
      <div>
        <div className="alert alert-error">
          <span className="alert-icon">⚠</span>
          <div>{error}</div>
        </div>
        <Link to="/" className="btn-ghost">← Back to files</Link>
      </div>
    );
  }

  const { fileName, scanResult } = data;
  const { threatLevel, summary, findings } = scanResult;

  return (
    <div>
      <Link to="/" className="btn-ghost" style={{ marginBottom: '24px' }}>
        ← Back to files
      </Link>

      <div className="page-header" style={{ marginTop: '16px' }}>
        <h2>📄 {fileName}</h2>
      </div>

      {/* Summary stats */}
      <div className="scan-summary">
        <div className="stat-card">
          <div className="stat-value">
            <span className={`threat-badge ${getThreatClass(threatLevel)}`}>
              {threatLevel}
            </span>
          </div>
          <div className="stat-label">Threat Level</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{findings ? findings.length : 0}</div>
          <div className="stat-label">Findings</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: '1rem' }}>
            {scanResult.scannedAt ? new Date(scanResult.scannedAt).toLocaleString() : '—'}
          </div>
          <div className="stat-label">Scanned At</div>
        </div>
      </div>

      {/* Summary text */}
      <div className="glass-card-sm" style={{ marginBottom: '32px' }}>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>{summary}</p>
      </div>

      {/* Results */}
      {(!findings || findings.length === 0) ? (
        <div className="clean-state">
          <span className="check-icon">✅</span>
          <h3>No threats detected</h3>
          <p>This log file appears clean. No suspicious patterns were found.</p>
        </div>
      ) : (
        <div>
          <h3 style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontWeight: 600 }}>
            🔍 Findings ({findings.length})
          </h3>
          {findings.map((f, idx) => (
            <div key={idx} className="finding-card">
              <div className="finding-header">
                <span className="finding-keyword">⚡ {f.keyword}</span>
                <span className="finding-line">Line {f.lineNumber}</span>
              </div>
              <p className="finding-description">{f.description}</p>
              <code className="finding-code">{f.lineContent}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
