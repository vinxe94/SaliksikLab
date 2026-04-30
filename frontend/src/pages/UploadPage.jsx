import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import Sidebar from '../components/Sidebar'
import api from '../api/axios'
import { UploadCloud, Link2 } from 'lucide-react'

function uploadErrorMessage(err) {
    const data = err.response?.data
    if (data?.file?.[0]) return data.file[0]
    if (data?.system_link?.[0]) return data.system_link[0]
    if (data?.detail) return data.detail
    return 'Upload failed.'
}

export default function UploadPage() {
    const navigate = useNavigate()
    const fileRef = useRef()
    const [loading, setLoading] = useState(false)
    const [dragging, setDragging] = useState(false)
    const [file, setFile] = useState(null)
    const [faculty, setFaculty] = useState([])
    const [departments, setDepartments] = useState([])
    const [courses, setCourses] = useState([])

    const [archiveForm, setArchiveForm] = useState({
        title: '', abstract: '', author: '', department: '',
        course: '', year: new Date().getFullYear(), keywords: '', system_link: '',
        assigned_faculty: '', is_public: true,
    })

    useEffect(() => {
        Promise.all([
            api.get('/auth/faculty/'),
            api.get('/repository/departments/'),
            api.get('/repository/courses/'),
        ]).then(([facultyRes, deptRes, courseRes]) => {
            setFaculty(facultyRes.data || [])
            setDepartments(deptRes.data || [])
            setCourses(courseRes.data || [])
        }).catch(() => {
            toast.error('Failed to load upload options.')
        })
    }, [])

    const chooseFile = (selected) => {
        if (!selected) return
        setFile(selected)
    }

    const onDrop = (e) => {
        e.preventDefault()
        setDragging(false)
        const dropped = e.dataTransfer.files[0]
        chooseFile(dropped)
    }

    const submit = async (e) => {
        e.preventDefault()
        if (!file) {
            toast.error('Please select a file to upload.')
            return
        }
        if (archiveForm.system_link && !/^https?:\/\//i.test(archiveForm.system_link)) {
            toast.error('System link must start with http:// or https://.')
            return
        }
        setLoading(true)
        try {
            const fd = new FormData()
            fd.append('title', archiveForm.title)
            fd.append('abstract', archiveForm.abstract)
            fd.append('author', archiveForm.author)
            fd.append('department', archiveForm.department)
            fd.append('course', archiveForm.course)
            fd.append('year', archiveForm.year)
            archiveForm.keywords
                .split(',')
                .map((keyword) => keyword.trim())
                .filter(Boolean)
                .forEach((keyword) => fd.append('keywords', keyword))
            if (archiveForm.system_link) {
                fd.append('system_link', archiveForm.system_link)
            }
            if (archiveForm.assigned_faculty) {
                fd.append('assigned_faculty', archiveForm.assigned_faculty)
            }
            fd.append('is_public', archiveForm.is_public ? 'true' : 'false')
            fd.append('file', file)

            const { data } = await api.post('/repository/archives/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
            toast.success('Archive document uploaded.')
            navigate(`/archives/${data.id}`)
        } catch (err) {
            toast.error(uploadErrorMessage(err))
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="layout">
            <Sidebar />
            <div className="main-content">
                <div className="page-header">
                    <div>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Upload Archive</h2>
                        <p style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>
                            Upload finalized research documents for review.
                        </p>
                    </div>
                </div>
                <div className="page-body">
                    <form className="upload-form" onSubmit={submit} style={{ maxWidth: 780, display: 'flex', flexDirection: 'column', gap: 20 }}>
                        <div
                            className={`dropzone ${dragging ? 'active' : ''}`}
                            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={onDrop}
                            onClick={() => fileRef.current.click()}
                        >
                            <input ref={fileRef} type="file" hidden onChange={(e) => chooseFile(e.target.files[0])} />
                            <UploadCloud size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.5 }} />
                            {file ? (
                                <>
                                    <p style={{ fontWeight: 600, color: 'var(--text)' }}>{file.name}</p>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                </>
                            ) : (
                                <>
                                    <p>Drag & drop your file here, or <span style={{ color: 'var(--accent)' }}>browse</span></p>
                                    <p style={{ fontSize: '0.8rem', marginTop: 4 }}>
                                        Upload a document, package, or supporting archive up to 100 MB.
                                    </p>
                                </>
                            )}
                        </div>

                        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Archive Metadata</h3>
                            <div className="form-group">
                                <label className="form-label">Title</label>
                                <input className="form-input" value={archiveForm.title} onChange={(e) => setArchiveForm((f) => ({ ...f, title: e.target.value }))} required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Abstract</label>
                                <textarea className="form-textarea" rows={4} value={archiveForm.abstract} onChange={(e) => setArchiveForm((f) => ({ ...f, abstract: e.target.value }))} placeholder="Optional abstract or summary." />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Keywords</label>
                                <input
                                    className="form-input"
                                    value={archiveForm.keywords}
                                    onChange={(e) => setArchiveForm((f) => ({ ...f, keywords: e.target.value }))}
                                    placeholder="machine learning, learning analytics, capstone"
                                />
                                <span className="dashboard-stat-meta">Separate keywords with commas.</span>
                            </div>
                            <div className="grid-2">
                                <div className="form-group">
                                    <label className="form-label">Author</label>
                                    <input className="form-input" value={archiveForm.author} onChange={(e) => setArchiveForm((f) => ({ ...f, author: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Year</label>
                                    <input className="form-input" type="number" value={archiveForm.year} onChange={(e) => setArchiveForm((f) => ({ ...f, year: e.target.value }))} />
                                </div>
                            </div>
                            <div className="grid-2">
                                <div className="form-group">
                                    <label className="form-label">Department</label>
                                    <select className="form-input" value={archiveForm.department} onChange={(e) => setArchiveForm((f) => ({ ...f, department: e.target.value, course: '' }))}>
                                        <option value="">Select department</option>
                                        {departments.map((department) => (
                                            <option key={department.id} value={department.name}>{department.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Course</label>
                                    <select className="form-input" value={archiveForm.course} onChange={(e) => setArchiveForm((f) => ({ ...f, course: e.target.value }))}>
                                        <option value="">Select course</option>
                                        {courses
                                            .filter((course) => !archiveForm.department || course.department_name === archiveForm.department)
                                            .map((course) => (
                                                <option key={course.id} value={course.name}>{course.name}</option>
                                            ))}
                                    </select>
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Assigned Faculty</label>
                                <select
                                    className="form-input"
                                    value={archiveForm.assigned_faculty}
                                    onChange={(e) => setArchiveForm((f) => ({ ...f, assigned_faculty: e.target.value }))}
                                    required
                                >
                                    <option value="">Select the faculty reviewer</option>
                                    {faculty.map((member) => (
                                        <option key={member.id} value={member.id}>
                                            {member.full_name || `${member.first_name} ${member.last_name}`} ({member.email})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Visibility</label>
                                <div className="filters repository-filters">
                                    <button
                                        type="button"
                                        className={`btn btn-sm ${archiveForm.is_public ? 'btn-primary' : 'btn-ghost'}`}
                                        onClick={() => setArchiveForm((f) => ({ ...f, is_public: true }))}
                                    >
                                        Public
                                    </button>
                                    <button
                                        type="button"
                                        className={`btn btn-sm ${!archiveForm.is_public ? 'btn-primary' : 'btn-ghost'}`}
                                        onClick={() => setArchiveForm((f) => ({ ...f, is_public: false }))}
                                    >
                                        Private
                                    </button>
                                </div>
                                <span className="dashboard-stat-meta">
                                    Public papers become visible to all roles after approval. Private papers stay limited to you, admins, and the assigned faculty.
                                </span>
                            </div>
                            <div className="form-group">
                                <label className="form-label">System Link</label>
                                <input
                                    className="form-input"
                                    type="url"
                                    placeholder="https://example.com/system"
                                    value={archiveForm.system_link}
                                    onChange={(e) => setArchiveForm((f) => ({ ...f, system_link: e.target.value }))}
                                />
                                <span className="dashboard-stat-meta" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    <Link2 size={13} /> Optional. Use an internet link that starts with http:// or https://.
                                </span>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 12 }}>
                            <button type="submit" className="btn btn-primary" disabled={loading}>
                                <UploadCloud size={16} /> {loading ? 'Saving...' : 'Upload Archive'}
                            </button>
                            <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Cancel</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}
