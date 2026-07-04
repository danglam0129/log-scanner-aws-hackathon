import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import FileList from './components/FileList';
import FileUpload from './components/FileUpload';
import ScanResultDetail from './components/ScanResultDetail';

const navStyle = {
  position: 'sticky',
  top: 0,
  zIndex: 100,
  display: 'flex',
  alignItems: 'center',
  gap: '24px',
  padding: '12px 24px',
  background: '#0f1b2d',
  borderBottom: '1px solid #1e3a5f',
};

const brandStyle = {
  fontSize: '1.4rem',
  fontWeight: 700,
  color: '#4fc3f7',
  textDecoration: 'none',
};

const linkStyle = (active) => ({
  color: active ? '#4fc3f7' : '#90a4ae',
  textDecoration: 'none',
  fontSize: '0.95rem',
  fontWeight: active ? 600 : 400,
});

const mainStyle = {
  maxWidth: '1100px',
  margin: '0 auto',
  padding: '32px 24px',
};

const footerStyle = {
  textAlign: 'center',
  padding: '24px',
  color: '#607d8b',
  fontSize: '0.85rem',
  borderTop: '1px solid #1e3a5f',
  marginTop: '48px',
};

export default function App() {
  const location = useLocation();

  return (
    <div style={{ minHeight: '100vh', background: '#1a1a2e', color: '#e0e0e0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <nav style={navStyle}>
        <Link to="/" style={brandStyle}>LogScan</Link>
        <Link to="/" style={linkStyle(location.pathname === '/')}>Files</Link>
        <Link to="/upload" style={linkStyle(location.pathname === '/upload')}>Upload</Link>
      </nav>

      <main style={mainStyle}>
        <Routes>
          <Route path="/" element={<FileList />} />
          <Route path="/upload" element={<FileUpload />} />
          <Route path="/files/:fileId/result" element={<ScanResultDetail />} />
        </Routes>
      </main>

      <footer style={footerStyle}>
        Log Threat Detection System • Built with React, API Gateway, Lambda, S3, SQS, and DynamoDB
      </footer>
    </div>
  );
}
