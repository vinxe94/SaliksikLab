import { useState, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import api from '../api/axios'
import {
    Folder, FileText, ChevronRight, ArrowLeft,
    File, Image, FileCode, FileJson, FileType,
    Download, Eye, Loader2, AlertCircle, FolderOpen
} from 'lucide-react'

/* ── Icon helper ── */
const EXT_ICONS = {
    py: FileCode, js: FileCode, ts: FileCode, jsx: FileCode, tsx: FileCode,
    java: FileCode, c: FileCode, cpp: FileCode, h: FileCode, cs: FileCode,
    php: FileCode, rb: FileCode, go: FileCode, rs: FileCode, swift: FileCode,
    html: FileCode, css: FileCode, scss: FileCode,
    json: FileJson, xml: FileJson, yaml: FileJson, yml: FileJson,
    md: FileType, txt: FileText, csv: FileText, log: FileText,
    png: Image, jpg: Image, jpeg: Image, gif: Image, svg: Image, webp: Image,
}

function getIcon(entry) {
    if (entry.type === 'dir') return Folder
    const Icon = EXT_ICONS[entry.extension]
    return Icon || File
}

function formatSize(bytes) {
    if (!bytes || bytes === 0) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function formatDate(iso) {
    if (!iso) return '—'
    try {
        const d = new Date(iso)
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
        return '—'
    }
}

/* ── Main Component ── */
export default function FileExplorer({ repositoryId, fileId, resourceBase = '/repository' }) {
    const [entries, setEntries] = useState([])
    const [currentPath, setCurrentPath] = useState('')
    const [archiveType, setArchiveType] = useState(null)
    const [originalFilename, setOriginalFilename] = useState('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    // File viewer state
    const [viewingFile, setViewingFile] = useState(null) // { path, name, type }
    const [fileContent, setFileContent] = useState(null)
    const [fileLoading, setFileLoading] = useState(false)

    const browse = useCallback(async (path = '') => {
        setLoading(true)
        setError(null)
        try {
            const url = fileId
                ? `${resourceBase}/${repositoryId}/browse/${fileId}/`
                : `${resourceBase}/${repositoryId}/browse/`
            const { data } = await api.get(url, { params: { path } })
            setEntries(data.entries || [])
            setCurrentPath(data.current_path || '')
            setArchiveType(data.archive_type)
            setOriginalFilename(data.original_filename || '')
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to load file structure.')
        } finally {
            setLoading(false)
        }
    }, [repositoryId, fileId])

    useEffect(() => {
        browse('')
    }, [browse])

    const navigateTo = (path) => {
        setViewingFile(null)
        setFileContent(null)
        browse(path)
    }

    const goUp = () => {
        const parts = currentPath.split('/')
        parts.pop()
        navigateTo(parts.join('/'))
    }

    const openFile = async (entry) => {
        if (entry.type === 'dir') {
            navigateTo(entry.path)
            return
        }

        setViewingFile({ path: entry.path, name: entry.name, type: entry.file_type })
        setFileContent(null)
        setFileLoading(true)

        try {
            const token = localStorage.getItem('access_token')
            const url = fileId
                ? `/api${resourceBase}/${repositoryId}/file-content/${fileId}/?path=${encodeURIComponent(entry.path)}`
                : `/api${resourceBase}/${repositoryId}/file-content/?path=${encodeURIComponent(entry.path)}`

            if (entry.file_type === 'text') {
                const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
                if (!res.ok) throw new Error('Failed to load file')
                const text = await res.text()
                setFileContent({ type: 'text', data: text })
            } else if (entry.file_type === 'image') {
                setFileContent({ type: 'image', url: `${url}&token=${token}` })
            } else if (entry.file_type === 'pdf') {
                setFileContent({ type: 'pdf', url: `${url}&token=${token}` })
            } else {
                setFileContent({ type: 'binary', name: entry.name })
            }
        } catch {
            setFileContent({ type: 'error', message: 'Failed to load file content.' })
        } finally {
            setFileLoading(false)
        }
    }

    const downloadFile = (entry) => {
        const token = localStorage.getItem('access_token')
        const url = fileId
            ? `/api${resourceBase}/${repositoryId}/file-content/${fileId}/?path=${encodeURIComponent(entry.path)}`
            : `/api${resourceBase}/${repositoryId}/file-content/?path=${encodeURIComponent(entry.path)}`
        fetch(url, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.blob()).then(blob => {
                const href = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = href; a.download = entry.name; a.click(); URL.revokeObjectURL(href)
            })
    }

    const breadcrumbs = currentPath ? currentPath.split('/') : []

    // Build line numbers for text content
    const renderLineNumbers = (text) => {
        const lines = text.split('\n')
        return lines.length
    }

    return (
        <div className="file-explorer" id="file-explorer">
            {/* Header */}
            <div className="fe-header">
                <div className="fe-header-left">
                    <FolderOpen size={16} className="fe-header-icon" />
                    <span className="fe-header-title">Repository Files</span>
                    {archiveType && (
                        <span className="badge badge-blue" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
                            {archiveType.toUpperCase()}
                        </span>
                    )}
                </div>
                {originalFilename && (
                    <span className="fe-header-filename" title={originalFilename}>
                        {originalFilename}
                    </span>
                )}
            </div>

            {/* Breadcrumb navigation */}
            <div className="fe-breadcrumbs">
                <button
                    className="fe-breadcrumb-btn fe-breadcrumb-root"
                    onClick={() => navigateTo('')}
                    title="Root"
                >
                    <Folder size={14} />
                    <span>root</span>
                </button>
                {breadcrumbs.map((part, i) => {
                    const path = breadcrumbs.slice(0, i + 1).join('/')
                    const isLast = i === breadcrumbs.length - 1
                    return (
                        <span key={path} className="fe-breadcrumb-segment">
                            <ChevronRight size={12} className="fe-breadcrumb-sep" />
                            <button
                                className={`fe-breadcrumb-btn ${isLast ? 'active' : ''}`}
                                onClick={() => navigateTo(path)}
                            >
                                {part}
                            </button>
                        </span>
                    )
                })}
            </div>

            {/* Error */}
            {error && (
                <div className="fe-error">
                    <AlertCircle size={16} />
                    <span>{error}</span>
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div className="fe-loading">
                    <Loader2 size={20} className="fe-spinner" />
                    <span>Loading files…</span>
                </div>
            )}

            {/* File list */}
            {!loading && !error && (
                <div className="fe-table-wrapper">
                    <table className="fe-table">
                        <thead>
                            <tr>
                                <th className="fe-th-name">Name</th>
                                <th className="fe-th-size">Size</th>
                                <th className="fe-th-date">Last Modified</th>
                                <th className="fe-th-actions"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Go up row */}
                            {currentPath && (
                                <tr className="fe-row fe-row-up" onClick={goUp}>
                                    <td colSpan={4} className="fe-cell-up">
                                        <ArrowLeft size={14} />
                                        <span>..</span>
                                    </td>
                                </tr>
                            )}

                            {entries.length === 0 && !currentPath && (
                                <tr>
                                    <td colSpan={4} className="fe-cell-empty">
                                        No files found in this repository.
                                    </td>
                                </tr>
                            )}

                            {entries.map(entry => {
                                const Icon = getIcon(entry)
                                const isDir = entry.type === 'dir'
                                const isActive = viewingFile?.path === entry.path

                                return (
                                    <tr
                                        key={entry.path}
                                        className={`fe-row ${isDir ? 'fe-row-dir' : 'fe-row-file'} ${isActive ? 'fe-row-active' : ''}`}
                                        onClick={() => openFile(entry)}
                                    >
                                        <td className="fe-cell-name">
                                            <Icon
                                                size={16}
                                                className={`fe-file-icon ${isDir ? 'fe-icon-dir' : 'fe-icon-file'}`}
                                            />
                                            <span className="fe-file-name">{entry.name}</span>
                                            {isDir && <ChevronRight size={14} className="fe-chevron" />}
                                        </td>
                                        <td className="fe-cell-size">
                                            {isDir ? '—' : formatSize(entry.size)}
                                        </td>
                                        <td className="fe-cell-date">
                                            {formatDate(entry.last_modified)}
                                        </td>
                                        <td className="fe-cell-actions" onClick={e => e.stopPropagation()}>
                                            {!isDir && (
                                                <div className="fe-action-btns">
                                                    <button
                                                        className="fe-action-btn"
                                                        title="View"
                                                        onClick={(e) => { e.stopPropagation(); openFile(entry) }}
                                                    >
                                                        <Eye size={13} />
                                                    </button>
                                                    <button
                                                        className="fe-action-btn"
                                                        title="Download"
                                                        onClick={(e) => { e.stopPropagation(); downloadFile(entry) }}
                                                    >
                                                        <Download size={13} />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* File Viewer */}
            {viewingFile && (
                <div className="fe-viewer">
                    <div className="fe-viewer-header">
                        <div className="fe-viewer-title">
                            <FileText size={15} />
                            <span>{viewingFile.name}</span>
                        </div>
                        <div className="fe-viewer-actions">
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => downloadFile(viewingFile)}
                                style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                            >
                                <Download size={13} /> Download
                            </button>
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => { setViewingFile(null); setFileContent(null) }}
                                style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                    <div className="fe-viewer-body">
                        {fileLoading ? (
                            <div className="fe-viewer-loading">
                                <Loader2 size={20} className="fe-spinner" />
                                <span>Loading file…</span>
                            </div>
                        ) : fileContent?.type === 'text' ? (
                            <div className="fe-code-container">
                                <div className="fe-line-numbers">
                                    {Array.from({ length: renderLineNumbers(fileContent.data) }, (_, i) => (
                                        <span key={i + 1}>{i + 1}</span>
                                    ))}
                                </div>
                                <pre className="fe-code">{fileContent.data}</pre>
                            </div>
                        ) : fileContent?.type === 'image' ? (
                            <div className="fe-image-preview">
                                <img src={fileContent.url} alt={viewingFile.name} />
                            </div>
                        ) : fileContent?.type === 'pdf' ? (
                            <iframe
                                src={fileContent.url}
                                className="fe-pdf-viewer"
                                title="PDF Viewer"
                            />
                        ) : fileContent?.type === 'binary' ? (
                            <div className="fe-binary-notice">
                                <File size={40} style={{ opacity: 0.3 }} />
                                <p>This file type cannot be previewed.</p>
                                <button className="btn btn-primary btn-sm" onClick={() => downloadFile(viewingFile)}>
                                    <Download size={14} /> Download File
                                </button>
                            </div>
                        ) : fileContent?.type === 'error' ? (
                            <div className="fe-binary-notice">
                                <AlertCircle size={24} style={{ color: 'var(--danger)' }} />
                                <p>{fileContent.message}</p>
                            </div>
                        ) : null}
                    </div>
                </div>
            )}
        </div>
    )
}

FileExplorer.propTypes = {
    repositoryId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    fileId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    resourceBase: PropTypes.string,
}

FileExplorer.defaultProps = {
    fileId: null,
    resourceBase: '/repository',
}
