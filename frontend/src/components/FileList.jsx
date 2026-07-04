import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getFiles } from '../api/fileApi';

const statusColors = {
  UPLOAD_PENDING: '#ffc107',
  PENDING: '#ffc107',
  COMPLETED: '#66bb6a',
  FAILED: '#ef5350',
};

const statusLabels = {
  UPLOAD_PENDING: 'Scanning...',
  PENDING: 'Scanning...',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
};

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
};

const thStyle = {
  textAlign: 'left',
  padding: '12px 16px',
  borderBottom: '1px solid #1e3a5f',
  color: '#90a4ae',
  fontSize: '0.85rem',
  fontWeight: 600,
};

const tdStyle = {
  padding: '12px 16px',
  borderBottom: '1px solid #1e3a5f',
  fontSize: '0.95rem',
};

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function FileList() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function fetchFiles() {
    setLoading(true);
    setError(null);
    try {
      const data = await getFiles();
      const sorted = (data.files || []).sort(
        (a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)
      );
      setFiles(sorted);
    } catch (err) {
      setError(err.message || 'Failed to load files.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchFiles();
  }, []);

  if (loading) {
    return <p style={{ color: '#90a4ae' }}>Loading files...</p>;
  }

  if (error) {
    return (
      <div>
        <p style={{ color: '#ef5350' }}>{error}</p>
        <button onClick={fetchFiles} style={{ padding: '8px 16px', background: '#4fc3f7', color: '#0f1b2d', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
          Retry
        </button>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <p style={{ color: '#90a4ae', fontSize: '1.1rem' }}>No files uploaded yet.</p>
        <Link to="/upload" style={{ color: '#4fc3f7' }}>Upload your first log file →</Link>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginBottom: '24px', color: '#4fc3f7' }}>Uploaded Files</h2>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>File Name</th>
            <th style={thStyle}>Size</th>
            <th style={thStyle}>Uploaded</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Action</th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <tr key={file.fileId}>
              <td style={tdStyle}>{file.fileName}</td>
              <td style={tdStyle}>{formatSize(file.fileSize)}</td>
              <td style={tdStyle}>{formatDate(file.uploadedAt)}</td>
              <td style={tdStyle}>
                <span style={{ color: statusColors[file.status] || '#90a4ae', fontWeight: 600 }}>
                  {statusLabels[file.status] || file.status}
                </span>
              </td>
              <td style={tdStyle}>
                {file.status === 'COMPLETED' && (
                  <Link to={`/files/${file.fileId}/result`} style={{ color: '#4fc3f7', textDecoration: 'none' }}>
                    View Results
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
