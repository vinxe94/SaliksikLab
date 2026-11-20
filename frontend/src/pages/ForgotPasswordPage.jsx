import { useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../api/axios'
import { MailCheck, ArrowLeft, Send, LoaderCircle } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'

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
        <AuthLayout title={sent ? 'Check your inbox.' : 'Let’s get you back in.'} subtitle={sent ? 'Your next step is just an email away.' : 'Enter your account email and we’ll send you a password reset link.'} footer={<Link to="/login"><ArrowLeft size={14} /> Back to sign in</Link>}>
            {sent ? (
                <div className="research-auth-confirmation" role="status">
                    <span className="research-auth-confirmation-icon"><MailCheck size={28} /></span>
                    <h2>Reset link requested</h2>
                    <p>If <strong>{email}</strong> is registered, you’ll receive a password reset link shortly. Check your spam folder if it doesn’t arrive.</p>
                    <button type="button" className="btn btn-ghost" onClick={() => setSent(false)}>Try a different email</button>
                </div>
            ) : (
                <form className="research-auth-form" onSubmit={submit} aria-busy={loading}>
                    <div className="form-group">
                        <label className="form-label" htmlFor="reset-email">Email address</label>
                        <input id="reset-email" name="email" type="email" autoComplete="email" className="form-input" placeholder="you@university.edu" value={email} onChange={e => setEmail(e.target.value)} required disabled={loading} />
                    </div>
                    <button type="submit" className="btn btn-primary research-auth-submit" disabled={loading}>
                        {loading ? <LoaderCircle size={17} className="research-loading-icon" /> : <Send size={17} />}{loading ? 'Sending reset link…' : 'Send reset link'}
                    </button>
                </form>
            )}
        </AuthLayout>
    )
}
