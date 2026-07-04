import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { isAuthConfigured, isAuthenticated, handleAuthCallback, getCurrentUser, login, logout } from './auth';
import FileList from './components/FileList';
import FileUpload from './components/FileUpload';
import ScanResultDetail from './components/ScanResultDetail';
import './styles.css';

function ProtectedRoute({ children }) {
  if (isAuthConfigured() && !isAuthenticated()) {
    return (
      <div className="signin-prompt">
        <p>Please sign in to continue.</p>
        <button onClick={login} className="btn-primary">Sign In</button>
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
      <div className="app-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="loading"><div className="spinner"></div> Loading...</div>
      </div>
    );
  }

  return (
    <div className="app-wrapper">
      <nav className="navbar">
        <Link to="/" className="navbar-brand">
          <span className="brand-icon">🛡</span>
          LogScan
        </Link>
        <Link to="/" className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}>
          📋 Files
        </Link>
        <Link to="/upload" className={`nav-link ${location.pathname === '/upload' ? 'active' : ''}`}>
          ⬆️ Upload
        </Link>

        {isAuthConfigured() && (
          <div className="nav-auth">
            {isAuthenticated() ? (
              <>
                <span className="nav-user">{user?.email || 'User'}</span>
                <button onClick={logout} className="btn-auth">Sign Out</button>
              </>
            ) : (
              <button onClick={login} className="btn-auth">Sign In</button>
            )}
          </div>
        )}
      </nav>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<ProtectedRoute><FileList /></ProtectedRoute>} />
          <Route path="/upload" element={<ProtectedRoute><FileUpload /></ProtectedRoute>} />
          <Route path="/files/:fileId/result" element={<ProtectedRoute><ScanResultDetail /></ProtectedRoute>} />
        </Routes>
      </main>

      <footer className="footer">
        Log Threat Detection System • Built with React, API Gateway, Lambda, S3, SQS, and DynamoDB
      </footer>
    </div>
  );
}
