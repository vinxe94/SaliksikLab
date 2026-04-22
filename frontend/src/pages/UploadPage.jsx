import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import Sidebar from '../components/Sidebar'
import api from '../api/axios'
import { UploadCloud, Link2 } from 'lucide-react'

const ALLOWED_EXT = '.pdf'
const PDF_ONLY_MESSAGE = 'Only PDF files are allowed.'

function isPdf(file) {
    return file?.name?.toLowerCase().endsWith('.pdf')
}

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

    const [archiveForm, setArchiveForm] = useState({
        title: '', abstract: '', author: '', department: '',
        course: '', year: new Date().getFullYear(), system_link: '',
    })

    const chooseFile = (selected) => {
        if (!selected) return
        if (!isPdf(selected)) {
            setFile(null)
            if (fileRef.current) fileRef.current.value = ''
            toast.error(PDF_ONLY_MESSAGE)
            return
        }
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
        if (!isPdf(file)) {
            toast.error(PDF_ONLY_MESSAGE)
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
            if (archiveForm.system_link) {
                fd.append('system_link', archiveForm.system_link)
            }
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
                            Upload finalized research documents as PDF files only.
                        </p>
                    </div>
                </div>
                <div className="page-body">
                    <form onSubmit={submit} style={{ maxWidth: 780, display: 'flex', flexDirection: 'column', gap: 20 }}>
                        <div
                            className={`dropzone ${dragging ? 'active' : ''}`}
                            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={onDrop}
                            onClick={() => fileRef.current.click()}
                        >
                            <input ref={fileRef} type="file" accept={ALLOWED_EXT} hidden onChange={(e) => chooseFile(e.target.files[0])} />
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
                                        PDF files only. Other file types will be rejected.
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
                                    <input className="form-input" value={archiveForm.department} onChange={(e) => setArchiveForm((f) => ({ ...f, department: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Course</label>
                                    <input className="form-input" value={archiveForm.course} onChange={(e) => setArchiveForm((f) => ({ ...f, course: e.target.value }))} />
                                </div>
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
