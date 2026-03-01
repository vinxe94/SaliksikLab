import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
    const { login } = useAuth()
    const navigate = useNavigate()
    const [form, setForm] = useState({ email: '', password: '' })
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [showPw, setShowPw] = useState(false)

    const handle = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

    const submit = async e => {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            const user = await login(form.email, form.password)
            navigate(user.role === 'admin' ? '/admin' : '/dashboard')
        } catch (err) {
            const detail = err.response?.data?.detail || ''
            if (err.response?.status === 403 || detail.toLowerCase().includes('pending')) {
                setError(detail || 'Your account is awaiting admin approval.')
            } else {
                setError('Invalid credentials. Please try again.')
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="auth-page">
            <div className="auth-orb auth-orb-1" />
            <div className="auth-orb auth-orb-2" />
            <div className="auth-orb auth-orb-3" />
            <div className="auth-orb auth-orb-4" />
            <div className="auth-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
                    <img src="/logo.png" alt="Research Repository" style={{ width: 40, height: 40, borderRadius: '50%' }} />
                    <span style={{ fontWeight: 800, fontSize: '1.3rem', color: 'var(--accent)' }}>
                        SaliksikLab
                    </span>
                </div>
                <h1 className="auth-title">Welcome back</h1>
                <p className="auth-subtitle">Sign in to your institutional research account</p>

                {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

                <form className="auth-form" onSubmit={submit}>
                    <div className="form-group">
                        <label className="form-label">Email address</label>
                        <input className="form-input" type="email" name="email" value={form.email} onChange={handle} required placeholder="you@university.edu" />
                    </div>
                    <div className="form-group">
                        <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Password</span>
                            <Link to="/forgot-password" style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--accent)', textDecoration: 'none' }}>Forgot password?</Link>
                        </label>
                        <div style={{ position: 'relative' }}>
                            <input className="form-input" type={showPw ? 'text' : 'password'} name="password" value={form.password} onChange={handle} required placeholder="••••••••" style={{ paddingRight: 42 }} />
                            <button type="button" onClick={() => setShowPw(s => !s)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)' }}>
                                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>
                    <button type="submit" className="btn btn-primary w-full" disabled={loading} style={{ marginTop: 4 }}>
                        {loading ? 'Signing in…' : 'Sign in'}
                    </button>
                </form>

                <p style={{ textAlign: 'center', marginTop: 20, fontSize: '0.85rem', color: 'var(--text2)' }}>
                    No account? <Link to="/register">Create one</Link>
                </p>
            </div>
        </div>
    )
}
