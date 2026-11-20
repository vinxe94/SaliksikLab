import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'

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
        <AuthLayout title="Welcome back." subtitle="Sign in to explore, contribute, and continue your research." footer={<>New to Tukiva? <Link to="/register">Create an account <ArrowRight size={14} /></Link></>}>
            {error && <div className="alert alert-error" role="alert">{error}</div>}
            <form className="research-auth-form" onSubmit={submit} aria-busy={loading}>
                <div className="form-group">
                    <label className="form-label" htmlFor="login-email"><Mail size={18} aria-hidden="true" />Email address</label>
                    <input id="login-email" className="form-input" type="email" name="email" autoComplete="username" value={form.email} onChange={handle} required placeholder="you@university.edu" disabled={loading} />
                </div>
                <div className="form-group">
                    <div className="research-auth-label-row">
                        <label className="form-label" htmlFor="login-password"><LockKeyhole size={18} aria-hidden="true" />Password</label>
                        <Link to="/forgot-password">Forgot password?</Link>
                    </div>
                    <div className="research-password-field">
                        <input id="login-password" className="form-input" type={showPw ? 'text' : 'password'} name="password" autoComplete="current-password" value={form.password} onChange={handle} required placeholder="Enter your password" disabled={loading} />
                        <button type="button" onClick={() => setShowPw(s => !s)} aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw}>
                            {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                </div>
                <button type="submit" className="btn btn-primary research-auth-submit" disabled={loading}>
                    {loading ? <LoaderCircle size={18} className="research-loading-icon" /> : null}
                    {loading ? 'Signing in…' : 'Sign in to your workspace'}
                    {!loading && <ArrowRight size={17} />}
                </button>
            </form>
        </AuthLayout>
    )
}
