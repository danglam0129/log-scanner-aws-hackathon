import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { requestUpload, uploadToS3, confirmUpload } from '../api/fileApi';

const MAX_SIZE = 10 * 1024 * 1024;

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function FileUpload() {
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const inputRef = useRef();

  function validate(f) {
    if (!f) return 'Please select a file.';
    if (f.size < 1) return 'File is empty.';
    if (f.size > MAX_SIZE) return 'File size must not exceed 10 MB.';
    return null;
  }

  function handleSelect(f) {
    setError(null);
    setSuccess(false);
    const err = validate(f);
    if (err) {
      setError(err);
      setFile(null);
    } else {
      setFile(f);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    handleSelect(e.dataTransfer.files[0]);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    setProgress(0);
    try {
      const { fileId, uploadUrl } = await requestUpload(file.name, file.size);
      await uploadToS3(uploadUrl, file, setProgress);
      await confirmUpload(fileId);
      setSuccess(true);
      setFile(null);
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Upload Log File</h2>
        <p>Drag & drop or browse to upload a log file for threat analysis</p>
      </div>

      {success && (
        <div className="alert alert-success">
          <span className="alert-icon">✓</span>
          <div>
            <strong>File uploaded successfully!</strong> Your log is being scanned.
            <br />
            <Link to="/" className="link-accent" style={{ marginTop: '8px', display: 'inline-block' }}>
              ← View all files
            </Link>
          </div>
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          <span className="alert-icon">⚠</span>
          <div>{error}</div>
        </div>
      )}

      <div
        className={`upload-zone ${isDragging ? 'dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Drop zone for log file upload"
      >
        <input
          ref={inputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={(e) => handleSelect(e.target.files[0])}
        />
        <span className="upload-icon">☁️</span>
        <h3>{isDragging ? 'Drop your file here...' : 'Drag & drop a log file here'}</h3>
        <p>or click to browse • any file up to 10 MB</p>
      </div>

      {file && (
        <div className="file-info">
          <div className="file-info-icon">📄</div>
          <div>
            <div className="file-info-name">{file.name}</div>
            <div className="file-info-size">{formatSize(file.size)}</div>
          </div>
        </div>
      )}

      {uploading && (
        <>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '8px', textAlign: 'center' }}>
            Uploading... {progress}%
          </p>
        </>
      )}

      {file && !uploading && !success && (
        <div style={{ marginTop: '24px' }}>
          <button className="btn-primary" onClick={handleUpload}>
            🚀 Start Upload
          </button>
        </div>
      )}

      {error && !uploading && (
        <div style={{ marginTop: '12px' }}>
          <button className="btn-danger" onClick={handleUpload}>
            ↻ Retry Upload
          </button>
        </div>
      )}
    </div>
  );
}
