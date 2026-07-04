import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getFiles } from '../api/fileApi';

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function getStatusClass(status) {
  if (status === 'COMPLETED') return 'completed';
  if (status === 'FAILED') return 'failed';
  return 'pending';
}

function getStatusLabel(status) {
  if (status === 'COMPLETED') return 'Completed';
  if (status === 'FAILED') return 'Failed';
  return 'Scanning...';
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

  useEffect(() => { fetchFiles(); }, []);

  if (loading) {
    return <div className="loading"><div className="spinner"></div> Loading files...</div>;
  }

  if (error) {
    return (
      <div>
        <div className="alert alert-error">
          <span className="alert-icon">⚠</span>
          <div>{error}</div>
        </div>
        <button onClick={fetchFiles} className="btn-ghost">↻ Retry</button>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-icon">📂</span>
        <h3>No files uploaded yet</h3>
        <p>
          <Link to="/upload" className="link-accent">Upload your first log file →</Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>Uploaded Files</h2>
        <p>{files.length} file{files.length !== 1 ? 's' : ''} scanned</p>
      </div>

      <table className="file-table">
        <thead>
          <tr>
            <th>File</th>
            <th>Size</th>
            <th>Uploaded</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <tr key={file.fileId}>
              <td>
                <div className="file-name-cell">
                  <span className="file-icon">📄</span>
                  {file.fileName}
                </div>
              </td>
              <td>{formatSize(file.fileSize)}</td>
              <td>{formatDate(file.uploadedAt)}</td>
              <td>
                <span className={`status-badge ${getStatusClass(file.status)}`}>
                  <span className="status-dot"></span>
                  {getStatusLabel(file.status)}
                </span>
              </td>
              <td>
                {file.status === 'COMPLETED' && (
                  <Link to={`/files/${file.fileId}/result`} className="btn-ghost">
                    View Results →
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
