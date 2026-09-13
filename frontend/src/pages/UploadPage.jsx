import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../contexts/AuthContext'
import api from '../api/axios'
import { FileCheck2, Link2, Send, UploadCloud } from 'lucide-react'

const TYPES = [
    ['research_paper', 'Research paper'],
    ['executable_system', 'Executable system'],
    ['paper_and_system', 'Research paper and executable system'],
]

function apiErrorMessage(err) {
    const data = err.response?.data

    const firstMessage = (value) => {
        if (typeof value === 'string') {
            const message = value.trim()
            if (message.startsWith('<!DOCTYPE') || message.startsWith('<html')) return ''
            return message
        }
        if (Array.isArray(value)) {
            for (const item of value) {
                const message = firstMessage(item)
                if (message) return message
            }
        } else if (value && typeof value === 'object') {
            for (const item of Object.values(value)) {
                const message = firstMessage(item)
                if (message) return message
            }
        }
        return ''
    }

    if (!err.response) return 'Cannot reach the server. Check that the backend and database are running.'
    if (err.response.status >= 500) return 'The server could not save the submission. Check that database migrations are up to date.'
    const responseMessage = firstMessage(data)
    if (responseMessage) return responseMessage
    return 'The submission could not be saved.'
}

export default function UploadPage() {
    const navigate = useNavigate()
    const { user } = useAuth()
    const isAdmin = user?.role === 'admin'
    const isStudent = user?.role === 'student'
    const [loading, setLoading] = useState(false)
    const [researchFile, setResearchFile] = useState(null)
    const [systemFile, setSystemFile] = useState(null)
    const [departments, setDepartments] = useState([])
    const [courses, setCourses] = useState([])
    const [form, setForm] = useState({
        title: '',
        abstract: '',
        submission_type: 'research_paper',
        author: '',
        department: '',
        course: '',
        year: new Date().getFullYear(),
        keywords: '',
        system_details: '',
        proposed_system_link: '',
    })

    const needsPaper = form.submission_type !== 'executable_system'
    const needsSystem = form.submission_type !== 'research_paper'

    useEffect(() => {
        Promise.all([
            api.get('/repository/departments/'),
            api.get('/repository/courses/'),
        ]).then(([deptRes, courseRes]) => {
            setDepartments(deptRes.data || [])
            setCourses(courseRes.data || [])
        }).catch(() => toast.error('Failed to load departments and courses.'))
    }, [])

    const payload = () => ({
        ...form,
        year: form.year || null,
        keywords: form.keywords.split(',').map((keyword) => keyword.trim()).filter(Boolean),
    })

    const submit = async (event) => {
        event.preventDefault()
        if (!isAdmin && !isStudent) {
            toast.error('Only students can request uploads.')
            return
        }
        if (needsSystem && !form.system_details.trim()) {
            toast.error('Describe the executable system for the administrator.')
            return
        }
        if (form.proposed_system_link && !/^https?:\/\//i.test(form.proposed_system_link)) {
            toast.error('System link must start with http:// or https://.')
            return
        }
        if (needsPaper && !researchFile) {
            toast.error('Select the research PDF.')
            return
        }
        if (needsSystem && !systemFile) {
            toast.error('Select the executable system ZIP.')
            return
        }
        if ([needsPaper && researchFile, needsSystem && systemFile].some(file => file && file.size > 100 * 1024 * 1024)) {
            toast.error('Each file must be 100 MB or smaller.')
            return
        }

        setLoading(true)
        try {
            if (isAdmin) {
                const data = payload()
                const body = new FormData()
                for (const [key, value] of Object.entries(data)) {
                    if (key === 'submission_type' || key === 'system_details') continue
                    if (key === 'proposed_system_link') {
                        if (value) body.append('system_link', value)
                    } else if (key === 'keywords') {
                        value.forEach((keyword) => body.append('keywords', keyword))
                    } else if (value !== null && value !== '') {
                        body.append(key, value)
                    }
                }
                if (needsPaper && researchFile) body.append('file', researchFile)
                if (needsSystem && systemFile) body.append('system_file', systemFile)
                const response = await api.post('/repository/archives/', body)
                toast.success('Research artifacts published.')
                navigate(`/archives/${response.data.id}`)
            } else {
                const body = new FormData()
                Object.entries(payload()).forEach(([key, value]) => {
                    if (value !== null) body.append(key, key === 'keywords' ? JSON.stringify(value) : value)
                })
                if (needsPaper && researchFile) body.append('research_file', researchFile)
                if (needsSystem && systemFile) body.append('system_file', systemFile)
                const response = await api.post('/repository/submission-requests/', body)
                toast.success(`Upload request #${response.data.id} joined the review queue.`)
                navigate(`/submission-requests/${response.data.id}`)
            }
        } catch (err) {
            toast.error(apiErrorMessage(err))
        } finally {
            setLoading(false)
        }
    }

    if (!isAdmin && !isStudent) {
        return (
            <div className="layout">
                <Sidebar />
                <div className="main-content">
                    <div className="page-body">
                        <div className="card" style={{ maxWidth: 680 }}>
                            <h2>Research submissions</h2>
                            <p style={{ color: 'var(--text2)', marginTop: 8 }}>
                                Students submit research files for review, and administrators approve and publish the artifacts.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="layout">
            <Sidebar />
            <div className="main-content">
                <div className="page-header">
                    <div>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                            {isAdmin ? 'Publish Research' : 'Request a Research Upload'}
                        </h2>
                        <p style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>
                            {isAdmin
                                ? 'Upload approved research papers and executable systems to the repository.'
                                : 'Upload your research PDF and system ZIP for administrator review. Requests are processed in submission order.'}
                        </p>
                    </div>
                </div>

                <div className="page-body">
                    <form className="upload-form" onSubmit={submit} style={{ maxWidth: 780, display: 'flex', flexDirection: 'column', gap: 20 }}>
                        {!isAdmin && (
                            <div className="card" style={{ borderLeft: '3px solid var(--accent)', display: 'flex', gap: 12 }}>
                                <FileCheck2 size={22} color="var(--accent)" />
                                <div>
                                    <strong>Your files stay private while the request is reviewed.</strong>
                                    <p style={{ color: 'var(--text2)', fontSize: '0.85rem', marginTop: 4 }}>
                                        The administrator can read your PDF before deciding. Approval publishes the files and saves your ZIP as this research’s default system configuration.
                                    </p>
                                </div>
                            </div>
                        )}

                        {(
                            <div className="card" style={{ display: 'grid', gap: 14 }}>
                                <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>{isAdmin ? 'Artifacts to publish' : 'Files for review'}</h3>
                                <p className="text-sm text-muted">Choose the submission type below to upload a PDF, a ZIP, or both. Maximum 100 MB per file.</p>
                                {needsPaper && (
                                    <div className="form-group">
                                        <label className="form-label" htmlFor="research-file">Research paper (PDF)</label>
                                        <input id="research-file" className="form-input" type="file" accept="application/pdf,.pdf" onChange={(event) => setResearchFile(event.target.files[0] || null)} required />
                                    </div>
                                )}
                                {needsSystem && (
                                    <div className="form-group">
                                        <label className="form-label" htmlFor="system-file">Executable system (ZIP)</label>
                                        <input id="system-file" className="form-input" type="file" accept="application/zip,.zip" onChange={(event) => setSystemFile(event.target.files[0] || null)} required />
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Submission details</h3>
                            <div className="form-group">
                                <label className="form-label">Submission type</label>
                                <select className="form-input" value={form.submission_type} onChange={(event) => setForm((current) => ({ ...current, submission_type: event.target.value }))}>
                                    {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Title</label>
                                <input className="form-input" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Abstract</label>
                                <textarea className="form-textarea" rows={4} value={form.abstract} onChange={(event) => setForm((current) => ({ ...current, abstract: event.target.value }))} placeholder="Optional abstract or summary." />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Keywords</label>
                                <input className="form-input" value={form.keywords} onChange={(event) => setForm((current) => ({ ...current, keywords: event.target.value }))} placeholder="machine learning, learning analytics, capstone" />
                                <span className="dashboard-stat-meta">Separate keywords with commas.</span>
                            </div>
                            <div className="grid-2">
                                <div className="form-group">
                                    <label className="form-label">Author</label>
                                    <input className="form-input" value={form.author} onChange={(event) => setForm((current) => ({ ...current, author: event.target.value }))} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Year</label>
                                    <input className="form-input" type="number" value={form.year} onChange={(event) => setForm((current) => ({ ...current, year: event.target.value }))} />
                                </div>
                            </div>
                            <div className="grid-2">
                                <div className="form-group">
                                    <label className="form-label">Department</label>
                                    <select className="form-input" value={form.department} onChange={(event) => setForm((current) => ({ ...current, department: event.target.value, course: '' }))}>
                                        <option value="">Select department</option>
                                        {departments.map((department) => <option key={department.id} value={department.name}>{department.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Course</label>
                                    <select className="form-input" value={form.course} onChange={(event) => setForm((current) => ({ ...current, course: event.target.value }))}>
                                        <option value="">Select course</option>
                                        {courses.filter((course) => !form.department || course.department_name === form.department).map((course) => (
                                            <option key={course.id} value={course.name}>{course.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            {needsSystem && (
                                <>
                                    <div className="form-group">
                                        <label className="form-label">System handoff details</label>
                                        <textarea className="form-textarea" rows={4} value={form.system_details} onChange={(event) => setForm((current) => ({ ...current, system_details: event.target.value }))} placeholder="Describe the uploaded system, technology stack, dependencies, and steps to run it. Include hosting.json inside the ZIP if configuration is needed." required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Proposed system link</label>
                                        <input className="form-input" type="url" placeholder="https://example.com/system" value={form.proposed_system_link} onChange={(event) => setForm((current) => ({ ...current, proposed_system_link: event.target.value }))} />
                                        <span className="dashboard-stat-meta" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                            <Link2 size={13} /> Optional. The administrator decides whether to publish this link.
                                        </span>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="upload-actions">
                            <button type="submit" className="btn btn-primary" disabled={loading}>
                                {isAdmin ? <UploadCloud size={16} /> : <Send size={16} />}
                                {loading ? 'Saving...' : isAdmin ? 'Publish artifacts' : 'Submit upload request'}
                            </button>
                            <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Cancel</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}
