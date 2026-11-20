import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../api/axios'
import { KeyRound, Eye, EyeOff, ArrowLeft, LoaderCircle } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'

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
        <AuthLayout title="A fresh start." subtitle="Choose a new password to securely access your research workspace." footer={<Link to="/login"><ArrowLeft size={14} /> Back to sign in</Link>}>
            {!token ? (
                <div className="research-auth-confirmation" role="alert">
                    <span className="research-auth-confirmation-icon"><KeyRound size={26} /></span>
                    <h2>This reset link isn’t valid</h2>
                    <p>Request a new link to reset your password and get back to your account.</p>
                    <Link to="/forgot-password" className="btn btn-primary">Request a new reset link</Link>
                </div>
            ) : (
                <form className="research-auth-form" onSubmit={submit} aria-busy={loading}>
                    <div className="form-group">
                        <label className="form-label" htmlFor="new-password">New password</label>
                        <div className="research-password-field">
                            <input id="new-password" name="password" autoComplete="new-password" type={showPw ? 'text' : 'password'} className="form-input" placeholder="At least 8 characters" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} disabled={loading} aria-describedby="new-password-hint" />
                            <button type="button" onClick={() => setShowPw(s => !s)} aria-label={showPw ? 'Hide passwords' : 'Show passwords'} aria-pressed={showPw}>{showPw ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                        </div>
                        <span className="research-form-hint" id="new-password-hint">Use at least 8 characters and avoid common words.</span>
                    </div>
                    <div className="form-group">
                        <label className="form-label" htmlFor="confirm-password">Confirm password</label>
                        <input id="confirm-password" name="password2" autoComplete="new-password" type={showPw ? 'text' : 'password'} className="form-input" placeholder="Repeat your new password" value={password2} onChange={e => setPassword2(e.target.value)} required disabled={loading} />
                    </div>
                    <button type="submit" className="btn btn-primary research-auth-submit" disabled={loading}>
                        {loading ? <LoaderCircle size={17} className="research-loading-icon" /> : <KeyRound size={17} />}{loading ? 'Resetting password…' : 'Reset password'}
                    </button>
                </form>
            )}
        </AuthLayout>
    )
}
