import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { isAuthConfigured, isAuthenticated, handleAuthCallback, getCurrentUser, login, logout } from './auth';
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

const authBtnStyle = {
  padding: '6px 14px',
  background: 'transparent',
  border: '1px solid #4fc3f7',
  color: '#4fc3f7',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '0.85rem',
  marginLeft: 'auto',
};

function ProtectedRoute({ children }) {
  if (isAuthConfigured() && !isAuthenticated()) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <p style={{ color: '#90a4ae', fontSize: '1.1rem' }}>Please sign in to continue.</p>
        <button onClick={login} style={{ ...authBtnStyle, marginLeft: 0, marginTop: '16px' }}>
          Sign In
        </button>
      </div>
    );
  }
  return children;
}

export default function App() {
  const location = useLocation();
  const [authReady, setAuthReady] = useState(!isAuthConfigured());
  const [user, setUser] = useState(null);

  useEffect(() => {
    async function initAuth() {
      if (!isAuthConfigured()) {
        setAuthReady(true);
        return;
      }

      // Handle OAuth callback if code is in URL
      const params = new URLSearchParams(window.location.search);
      if (params.has('code')) {
        await handleAuthCallback();
      }

      if (isAuthenticated()) {
        setUser(getCurrentUser());
      }
      setAuthReady(true);
    }
    initAuth();
  }, []);

  if (!authReady) {
    return (
      <div style={{ minHeight: '100vh', background: '#1a1a2e', color: '#e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#1a1a2e', color: '#e0e0e0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <nav style={navStyle}>
        <Link to="/" style={brandStyle}>LogScan</Link>
        <Link to="/" style={linkStyle(location.pathname === '/')}>Files</Link>
        <Link to="/upload" style={linkStyle(location.pathname === '/upload')}>Upload</Link>

        {isAuthConfigured() && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
            {isAuthenticated() ? (
              <>
                <span style={{ color: '#90a4ae', fontSize: '0.85rem' }}>
                  {user?.email || 'User'}
                </span>
                <button onClick={logout} style={authBtnStyle}>Sign Out</button>
              </>
            ) : (
              <button onClick={login} style={authBtnStyle}>Sign In</button>
            )}
          </div>
        )}
      </nav>

      <main style={mainStyle}>
        <Routes>
          <Route path="/" element={<ProtectedRoute><FileList /></ProtectedRoute>} />
          <Route path="/upload" element={<ProtectedRoute><FileUpload /></ProtectedRoute>} />
          <Route path="/files/:fileId/result" element={<ProtectedRoute><ScanResultDetail /></ProtectedRoute>} />
        </Routes>
      </main>

      <footer style={footerStyle}>
        Log Threat Detection System • Built with React, API Gateway, Lambda, S3, SQS, and DynamoDB
      </footer>
    </div>
  );
}
