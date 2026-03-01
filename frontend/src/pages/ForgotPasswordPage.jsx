import { useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../api/axios'
import { Mail, ArrowLeft, Send } from 'lucide-react'

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [sent, setSent] = useState(false)

    const submit = async e => {
        e.preventDefault()
        setLoading(true)
        try {
            await api.post('/auth/password-reset/', { email: email.trim().toLowerCase() })
            setSent(true)
        } catch {
            toast.error('Something went wrong. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 16 }}>
            <div style={{ width: '100%', maxWidth: 400 }}>
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        <Mail size={22} color="#fff" />
                    </div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 6 }}>Forgot Password</h1>
                    <p style={{ color: 'var(--text2)', fontSize: '0.9rem' }}>
                        Enter your email and we&apos;ll send you a reset link.
                    </p>
                </div>

                {sent ? (
                    <div className="card" style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem', marginBottom: 12 }}>📧</div>
                        <h3 style={{ marginBottom: 8 }}>Check your inbox</h3>
                        <p style={{ color: 'var(--text2)', fontSize: '0.88rem', lineHeight: 1.6 }}>
                            If <strong>{email}</strong> is registered, you&apos;ll receive a password reset link shortly.
                        </p>
                        <Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 20, color: 'var(--accent)', fontSize: '0.88rem', textDecoration: 'none' }}>
                            <ArrowLeft size={14} /> Back to Login
                        </Link>
                    </div>
                ) : (
                    <div className="card">
                        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div className="form-group">
                                <label className="form-label">Email address</label>
                                <input
                                    type="email"
                                    className="form-input"
                                    placeholder="you@example.com"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    required
                                    autoFocus
                                />
                            </div>
                            <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>
                                <Send size={15} /> {loading ? 'Sending…' : 'Send Reset Link'}
                            </button>
                        </form>
                        <div style={{ textAlign: 'center', marginTop: 16 }}>
                            <Link to="/login" style={{ color: 'var(--text2)', fontSize: '0.85rem', textDecoration: 'none' }}>
                                <ArrowLeft size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />Back to Login
                            </Link>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
