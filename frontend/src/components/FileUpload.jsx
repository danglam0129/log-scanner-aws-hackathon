import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { requestUpload, uploadToS3, confirmUpload } from '../api/fileApi';

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const dropZoneStyle = (isDragging) => ({
  border: `2px dashed ${isDragging ? '#4fc3f7' : '#37474f'}`,
  borderRadius: '12px',
  padding: '48px 24px',
  textAlign: 'center',
  cursor: 'pointer',
  background: isDragging ? 'rgba(79, 195, 247, 0.05)' : 'rgba(255,255,255,0.02)',
  transition: 'all 0.2s',
});

const btnStyle = {
  padding: '10px 24px',
  background: '#4fc3f7',
  color: '#0f1b2d',
  border: 'none',
  borderRadius: '6px',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: '0.95rem',
};

const progressBarOuter = {
  width: '100%',
  height: '8px',
  background: '#263238',
  borderRadius: '4px',
  marginTop: '16px',
  overflow: 'hidden',
};

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
    const f = e.dataTransfer.files[0];
    handleSelect(f);
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
      <h2 style={{ marginBottom: '24px', color: '#4fc3f7' }}>Upload Log File</h2>

      {success && (
        <div style={{ padding: '16px', background: '#1b5e20', borderRadius: '8px', marginBottom: '24px' }}>
          <p style={{ margin: 0 }}>✓ File uploaded successfully!</p>
          <Link to="/" style={{ color: '#81c784', marginTop: '8px', display: 'inline-block' }}>← Back to file list</Link>
        </div>
      )}

      {error && (
        <div style={{ padding: '16px', background: '#b71c1c', borderRadius: '8px', marginBottom: '24px' }}>
          <p style={{ margin: 0 }}>{error}</p>
        </div>
      )}

      <div
        style={dropZoneStyle(isDragging)}
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
        <p style={{ fontSize: '1.1rem', color: '#90a4ae' }}>
          {isDragging ? 'Drop your file here...' : 'Drag & drop a log file here, or click to browse'}
        </p>
        <p style={{ fontSize: '0.85rem', color: '#607d8b', marginTop: '8px' }}>
          Any file up to 10 MB
        </p>
      </div>

      {file && (
        <div style={{ marginTop: '24px', padding: '16px', background: '#1e3a5f', borderRadius: '8px' }}>
          <p style={{ margin: 0 }}><strong>Selected:</strong> {file.name}</p>
          <p style={{ margin: '4px 0 0', color: '#90a4ae', fontSize: '0.9rem' }}>
            {(file.size / 1024).toFixed(1)} KB
          </p>
        </div>
      )}

      {uploading && (
        <div style={progressBarOuter}>
          <div style={{ width: `${progress}%`, height: '100%', background: '#4fc3f7', borderRadius: '4px', transition: 'width 0.2s' }} />
        </div>
      )}

      {file && !uploading && !success && (
        <button style={{ ...btnStyle, marginTop: '20px' }} onClick={handleUpload}>
          Upload
        </button>
      )}

      {error && !uploading && (
        <button style={{ ...btnStyle, marginTop: '12px', background: '#ff7043' }} onClick={handleUpload}>
          Retry
        </button>
      )}
    </div>
  );
}
