import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getScanResult } from '../api/fileApi';

const threatColors = {
  NONE: '#66bb6a',
  LOW: '#81c784',
  MEDIUM: '#ffa726',
  HIGH: '#ff7043',
  CRITICAL: '#ef5350',
};

const badgeStyle = (level) => ({
  display: 'inline-block',
  padding: '4px 12px',
  borderRadius: '4px',
  background: threatColors[level] || '#607d8b',
  color: '#fff',
  fontWeight: 700,
  fontSize: '0.85rem',
});

const findingStyle = {
  padding: '16px',
  background: '#1e3a5f',
  borderRadius: '8px',
  marginBottom: '12px',
};

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
    return <p style={{ color: '#90a4ae' }}>Loading scan result...</p>;
  }

  if (error) {
    return (
      <div>
        <p style={{ color: '#ef5350' }}>{error}</p>
        <Link to="/" style={{ color: '#4fc3f7' }}>← Back to files</Link>
      </div>
    );
  }

  const { fileName, scanResult } = data;
  const { threatLevel, summary, findings } = scanResult;

  return (
    <div>
      <Link to="/" style={{ color: '#4fc3f7', textDecoration: 'none', marginBottom: '24px', display: 'inline-block' }}>
        ← Back to files
      </Link>

      <h2 style={{ color: '#e0e0e0', marginBottom: '8px' }}>{fileName}</h2>

      <div style={{ marginBottom: '24px' }}>
        <span style={{ color: '#90a4ae', marginRight: '12px' }}>Threat Level:</span>
        <span style={badgeStyle(threatLevel)}>{threatLevel}</span>
      </div>

      <p style={{ color: '#b0bec5', marginBottom: '32px', lineHeight: 1.6 }}>{summary}</p>

      {(!findings || findings.length === 0) ? (
        <div style={{ textAlign: 'center', padding: '32px', background: '#1b5e20', borderRadius: '12px' }}>
          <p style={{ margin: 0, fontSize: '1.1rem', color: '#a5d6a7' }}>✓ No threats detected</p>
          <p style={{ margin: '8px 0 0', color: '#81c784', fontSize: '0.9rem' }}>This log file appears clean.</p>
        </div>
      ) : (
        <div>
          <h3 style={{ color: '#90a4ae', marginBottom: '16px' }}>Findings ({findings.length})</h3>
          {findings.map((f, idx) => (
            <div key={idx} style={findingStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: '#ff7043', fontWeight: 600 }}>{f.keyword}</span>
                <span style={{ color: '#607d8b', fontSize: '0.85rem' }}>Line {f.lineNumber}</span>
              </div>
              <p style={{ margin: '0 0 8px', color: '#b0bec5', fontSize: '0.9rem' }}>{f.description}</p>
              <code style={{ display: 'block', padding: '8px 12px', background: '#0f1b2d', borderRadius: '4px', fontSize: '0.85rem', color: '#90a4ae', overflowX: 'auto' }}>
                {f.lineContent}
              </code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
