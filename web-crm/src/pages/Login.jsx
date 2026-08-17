import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import api, { apiError } from '../api/client.js';
import { Modal } from '../components/ui.jsx';
import BrandMark from '../components/BrandMark.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(identifier.trim(), password);
      navigate('/');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand">
          <BrandMark size={42} radius={13} />
          <span className="wordmark brand">ProCall<span className="ai">Ai</span></span>
        </div>
        <p className="subtitle">Business Calling + CRM — sign in to your account</p>

        {error && <div className="error-text">{error}</div>}

        <div className="field">
          <label>Mobile number or email</label>
          <input
            className="input"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="admin@callingapp.local"
            autoFocus
          />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
          {busy ? <span className="spinner" /> : 'Sign in'}
        </button>

        <p className="hint">
          <span className="link" onClick={() => setShowForgot(true)}>Forgot password?</span>
          <br />Demo: admin@callingapp.local / Password@123
        </p>
      </form>

      {showForgot && <ForgotPasswordModal onClose={() => setShowForgot(false)} />}
    </div>
  );
}

function ForgotPasswordModal({ onClose }) {
  const [step, setStep] = useState(1);
  const [identifier, setIdentifier] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function request() {
    setBusy(true); setError('');
    try {
      const res = await api.post('/auth/forgot-password', { identifier: identifier.trim() });
      setMessage(res.data.message);
      // In dev the backend returns the token so the flow is usable without email.
      if (res.data.resetToken) setToken(res.data.resetToken);
      setStep(2);
    } catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  }

  async function reset() {
    setBusy(true); setError('');
    try {
      await api.post('/auth/reset-password', { token: token.trim(), newPassword });
      setStep(3);
    } catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  }

  return (
    <Modal
      title="Reset password"
      onClose={onClose}
      footer={step === 1
        ? <><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={request} disabled={busy || identifier.length < 3}>Send reset token</button></>
        : step === 2
          ? <><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={reset} disabled={busy || !token || newPassword.length < 8}>Reset password</button></>
          : <button className="btn primary" onClick={onClose}>Done</button>}
    >
      {error && <div className="error-text">{error}</div>}
      {step === 1 && (
        <div className="field"><label>Mobile number or email</label><input className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoFocus /></div>
      )}
      {step === 2 && (
        <>
          {message && <p className="muted" style={{ marginTop: 0 }}>{message}</p>}
          <div className="field"><label>Reset token</label><input className="input" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste the token you received" /></div>
          <div className="field"><label>New password (min 8)</label><input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
        </>
      )}
      {step === 3 && <p style={{ color: 'var(--green)' }}>Password reset successfully. You can now sign in.</p>}
    </Modal>
  );
}
