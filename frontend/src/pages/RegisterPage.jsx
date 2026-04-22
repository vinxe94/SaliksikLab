import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import 'react'

const ROLES = ['student', 'faculty', 'researcher']

export default function RegisterPage() {
    const { register } = useAuth()
    const navigate = useNavigate()
    const [form, setForm] = useState({ email: '', first_name: '', last_name: '', role: 'student', department: '', password: '', password2: '' })
    const [errors, setErrors] = useState({})
    const [loading, setLoading] = useState(false)

    const handle = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

    const submit = async e => {
        e.preventDefault()
        setErrors({})
        setLoading(true)
        try {
            const user = await register(form)
            navigate(user.role === 'admin' ? '/admin' : '/dashboard')
        } catch (err) {
            setErrors(err.response?.data || { non_field_errors: ['Registration failed.'] })
        } finally {
            setLoading(false)
        }
    }

    const field = (name, label, type = 'text', placeholder = '') => (
        <div className="form-group">
            <label className="form-label">{label}</label>
            <input className="form-input" type={type} name={name} value={form[name]} onChange={handle} required placeholder={placeholder} />
            {errors[name] && <span className="form-error">{errors[name][0]}</span>}
        </div>
    )

    return (
        <div className="auth-page">
            <div className="auth-orb auth-orb-1" />
            <div className="auth-orb auth-orb-2" />
            <div className="auth-orb auth-orb-3" />
            <div className="auth-orb auth-orb-4" />
            <div className="auth-card" style={{ maxWidth: 520 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                    <img src="/logo.png" alt="Research Repository" style={{ width: 36, height: 36, borderRadius: '50%' }} />
                    <span style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--accent)' }}>SaliksikLab</span>
                </div>
                <h1 className="auth-title">Create account</h1>
                <p className="auth-subtitle">Join your institution&apos;s research repository</p>

                {errors.non_field_errors && <div className="alert alert-error" style={{ marginBottom: 16 }}>{errors.non_field_errors[0]}</div>}

                <form className="auth-form" onSubmit={submit}>
                    <div className="grid-2">
                        {field('first_name', 'First Name', 'text', 'Juan')}
                        {field('last_name', 'Last Name', 'text', 'Dela Cruz')}
                    </div>
                    {field('email', 'Email Address', 'email', 'you@university.edu')}
                    <div className="grid-2">
                        <div className="form-group">
                            <label className="form-label">Role</label>
                            <select className="form-select" name="role" value={form.role} onChange={handle}>
                                {ROLES.map(r => <option key={r} value={r} style={{ textTransform: 'capitalize' }}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                            </select>
                        </div>
                        {field('department', 'Department', 'text', 'College of Engineering')}
                    </div>
                    {field('password', 'Password', 'password', '••••••••')}
                    {field('password2', 'Confirm Password', 'password', '••••••••')}
                    {errors.password && <div className="alert alert-error">{errors.password[0]}</div>}

                    <button type="submit" className="btn btn-primary w-full" disabled={loading} style={{ marginTop: 4 }}>
                        {loading ? 'Creating account…' : 'Create account'}
                    </button>
                </form>
                <p style={{ textAlign: 'center', marginTop: 18, fontSize: '0.85rem', color: 'var(--text2)' }}>
                    Already have an account? <Link to="/login">Sign in</Link>
                </p>
            </div>
        </div>
    )
}
