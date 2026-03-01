import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../api/axios'
import { KeyRound, Eye, EyeOff } from 'lucide-react'

export default function ResetPasswordPage() {
    const navigate = useNavigate()
    const token = new URLSearchParams(window.location.search).get('token') || ''
    const [password, setPassword] = useState('')
    const [password2, setPassword2] = useState('')
    const [showPw, setShowPw] = useState(false)
    const [loading, setLoading] = useState(false)

    const submit = async e => {
        e.preventDefault()
        if (password !== password2) { toast.error('Passwords do not match.'); return }
        if (!token) { toast.error('Invalid reset link.'); return }
        setLoading(true)
        try {
            await api.post('/auth/password-reset/confirm/', { token, new_password: password })
            toast.success('Password reset! You can now log in.')
            navigate('/login')
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Reset failed. The link may have expired.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 16 }}>
            <div style={{ width: '100%', maxWidth: 400 }}>
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        <KeyRound size={22} color="#fff" />
                    </div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 6 }}>Set New Password</h1>
                    <p style={{ color: 'var(--text2)', fontSize: '0.9rem' }}>Choose a strong password for your account.</p>
                </div>

                <div className="card">
                    {!token ? (
                        <div style={{ textAlign: 'center', color: 'var(--danger)' }}>
                            <p>This reset link is invalid or expired.</p>
                            <Link to="/forgot-password" style={{ color: 'var(--accent)', fontSize: '0.88rem' }}>Request a new one</Link>
                        </div>
                    ) : (
                        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div className="form-group">
                                <label className="form-label">New Password</label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type={showPw ? 'text' : 'password'}
                                        className="form-input"
                                        placeholder="At least 8 characters"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        required
                                        minLength={8}
                                        style={{ paddingRight: 40 }}
                                    />
                                    <button type="button" onClick={() => setShowPw(s => !s)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)' }}>
                                        {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Confirm Password</label>
                                <input
                                    type={showPw ? 'text' : 'password'}
                                    className="form-input"
                                    placeholder="Repeat your password"
                                    value={password2}
                                    onChange={e => setPassword2(e.target.value)}
                                    required
                                />
                            </div>
                            <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>
                                <KeyRound size={15} /> {loading ? 'Resetting…' : 'Reset Password'}
                            </button>
                        </form>
                    )}
                    <div style={{ textAlign: 'center', marginTop: 14 }}>
                        <Link to="/login" style={{ color: 'var(--text2)', fontSize: '0.85rem', textDecoration: 'none' }}>Back to Login</Link>
                    </div>
                </div>
            </div>
        </div>
    )
}
