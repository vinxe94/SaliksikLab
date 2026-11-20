import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../api/axios'
import { ArrowRight, Eye, EyeOff, LoaderCircle } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'

const ROLES = ['student', 'faculty']

export default function RegisterPage() {
    const { register } = useAuth()
    const navigate = useNavigate()
    const [form, setForm] = useState({ email: '', first_name: '', last_name: '', role: 'student', department: '', password: '', password2: '' })
    const [departments, setDepartments] = useState([])
    const [departmentsLoading, setDepartmentsLoading] = useState(true)
    const [errors, setErrors] = useState({})
    const [loading, setLoading] = useState(false)
    const [showPw, setShowPw] = useState(false)

    useEffect(() => {
        api.get('/repository/departments/')
            .then((response) => setDepartments(response.data || []))
            .catch(() => setDepartments([]))
            .finally(() => setDepartmentsLoading(false))
    }, [])

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

    const field = (name, label, type = 'text', placeholder = '') => {
        const error = Array.isArray(errors[name]) ? errors[name][0] : errors[name]
        const autocomplete = { first_name: 'given-name', last_name: 'family-name', email: 'email', password: 'new-password', password2: 'new-password' }
        const isPassword = type === 'password'
        return (
            <div className="form-group">
                <label className="form-label" htmlFor={`register-${name}`}>{label}</label>
                <div className={isPassword ? 'research-password-field' : undefined}>
                    <input id={`register-${name}`} className="form-input" type={isPassword && showPw ? 'text' : type} name={name} autoComplete={autocomplete[name]} value={form[name]} onChange={handle} required placeholder={placeholder} disabled={loading} aria-invalid={Boolean(error)} aria-describedby={error ? `register-${name}-error` : undefined} />
                    {isPassword && <button type="button" onClick={() => setShowPw(s => !s)} aria-label={showPw ? 'Hide passwords' : 'Show passwords'} aria-pressed={showPw}>{showPw ? <EyeOff size={18} /> : <Eye size={18} />}</button>}
                </div>
                {error && <span id={`register-${name}-error`} className="form-error">{error}</span>}
            </div>
        )
    }

    return (
        <AuthLayout wide title="Make room for your ideas." subtitle="Create your account and join your institution’s research community." footer={<>Already have an account? <Link to="/login">Sign in <ArrowRight size={14} /></Link></>}>
            {errors.non_field_errors && <div className="alert alert-error" role="alert">{errors.non_field_errors[0]}</div>}
            <form className="research-auth-form" onSubmit={submit} aria-busy={loading}>
                <div className="research-form-grid">
                    {field('first_name', 'First name', 'text', 'Juan')}
                    {field('last_name', 'Last name', 'text', 'Dela Cruz')}
                </div>
                {field('email', 'Email address', 'email', 'you@university.edu')}
                <div className="research-form-grid">
                    <div className="form-group">
                        <label className="form-label" htmlFor="register-role">I am a</label>
                        <select id="register-role" className="form-select" name="role" value={form.role} onChange={handle} disabled={loading}>
                            {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label" htmlFor="register-department">Department</label>
                        <select id="register-department" className="form-select" name="department" value={form.department} onChange={handle} required disabled={departmentsLoading || loading} aria-invalid={Boolean(errors.department)} aria-describedby={errors.department ? 'register-department-error' : undefined}>
                            <option value="">{departmentsLoading ? 'Loading…' : 'Select department'}</option>
                            {departments.map((department) => <option key={department.id} value={department.name}>{department.name}</option>)}
                        </select>
                        {errors.department && <span id="register-department-error" className="form-error">{errors.department[0]}</span>}
                    </div>
                </div>
                <div className="research-form-grid">
                    {field('password', 'Password', 'password', 'Create a password')}
                    {field('password2', 'Confirm password', 'password', 'Repeat password')}
                </div>
                <p className="research-form-hint">Use a unique password to keep your research account secure.</p>
                <button type="submit" className="btn btn-primary research-auth-submit" disabled={loading || departmentsLoading}>
                    {loading ? <LoaderCircle size={18} className="research-loading-icon" /> : null}{loading ? 'Creating account…' : 'Create account'}{!loading && <ArrowRight size={17} />}
                </button>
            </form>
        </AuthLayout>
    )
}
