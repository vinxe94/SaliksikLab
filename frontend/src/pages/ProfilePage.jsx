import { useState } from 'react'
import toast from 'react-hot-toast'
import Sidebar from '../components/Sidebar'
import api from '../api/axios'
import { useAuth } from '../contexts/AuthContext'
import { Mail, Building, Shield } from 'lucide-react'

const roleColors = { admin: 'badge-red', faculty: 'badge-blue', student: 'badge-green', researcher: 'badge-yellow' }

export default function ProfilePage() {
    const { user } = useAuth()
    const [form, setForm] = useState({ first_name: user?.first_name || '', last_name: user?.last_name || '', department: user?.department || '' })
    const [saving, setSaving] = useState(false)

    const handle = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

    const save = async e => {
        e.preventDefault()
        setSaving(true)
        try {
            await api.patch('/auth/me/', form)
            toast.success('Profile updated!')
        } catch {
            toast.error('Update failed.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="layout">
            <Sidebar />
            <div className="main-content">
                <div className="page-header">
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>My Profile</h2>
                </div>
                <div className="page-body">
                    <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 20 }}>

                        {/* Avatar + role card */}
                        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, #1B5E20, #43A047)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                                {user?.first_name?.[0]}{user?.last_name?.[0]}
                            </div>
                            <div>
                                <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>{user?.first_name} {user?.last_name}</h2>
                                <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <span className={`badge ${roleColors[user?.role]}`}><Shield size={11} style={{ marginRight: 3 }} />{user?.role}</span>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text2)' }}><Mail size={12} style={{ display: 'inline', marginRight: 4 }} />{user?.email}</span>
                                    {user?.department && <span style={{ fontSize: '0.8rem', color: 'var(--text2)' }}><Building size={12} style={{ display: 'inline', marginRight: 4 }} />{user?.department}</span>}
                                </div>
                            </div>
                        </div>

                        {/* Edit form */}
                        <div className="card">
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16 }}>Edit Profile</h3>
                            <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <div className="grid-2">
                                    <div className="form-group">
                                        <label className="form-label">First Name</label>
                                        <input className="form-input" name="first_name" value={form.first_name} onChange={handle} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Last Name</label>
                                        <input className="form-input" name="last_name" value={form.last_name} onChange={handle} />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Department</label>
                                    <input className="form-input" name="department" value={form.department} onChange={handle} placeholder="College of Engineering" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Email</label>
                                    <input className="form-input" value={user?.email} disabled style={{ opacity: 0.5 }} />
                                    <span className="text-xs text-muted" style={{ marginTop: 3 }}>Email cannot be changed here.</span>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Role</label>
                                    <input className="form-input" value={user?.role} disabled style={{ opacity: 0.5, textTransform: 'capitalize' }} />
                                    <span className="text-xs text-muted" style={{ marginTop: 3 }}>Role can only be changed by an admin.</span>
                                </div>
                                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                                    <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
                                </div>
                            </form>
                        </div>

                        {/* Account info */}
                        <div className="card">
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 12 }}>Account Info</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {[['Member since', new Date(user?.date_joined).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })], ['Account status', 'Active']].map(([l, v]) => (
                                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                        <span style={{ color: 'var(--text2)' }}>{l}</span>
                                        <span style={{ fontWeight: 600 }}>{v}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
