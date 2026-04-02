import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import api from '../api/axios'
import { Search, Filter, BookOpen, User } from 'lucide-react'

const TYPE_OPTIONS = [
    { value: '', label: 'All Types' },
    { value: 'thesis', label: 'Thesis' },
    { value: 'software', label: 'Software' },
    { value: 'sourcecode', label: 'Source Code' },
    { value: 'documentation', label: 'Documentation' },
    { value: 'other', label: 'Other' },
]
const YEAR_OPTIONS = [{ value: '', label: 'All Years' }, ...Array.from({ length: 10 }, (_, i) => {
    const y = new Date().getFullYear() - i; return { value: String(y), label: String(y) }
})]
const typeColor = { thesis: 'badge-blue', software: 'badge-green', sourcecode: 'badge-yellow', documentation: 'badge-gray', other: 'badge-gray' }

export default function RepositoryPage() {
    const navigate = useNavigate()
    const [items, setItems] = useState([])
    const [count, setCount] = useState(0)
    const [page, setPage] = useState(1)
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [filters, setFilters] = useState({ type: '', year: '', department: '', course: '' })
    const [mineOnly, setMineOnly] = useState(false)

    const load = useCallback(() => {
        setLoading(true)
        const params = new URLSearchParams({
            page,
            ...(search && { search }),
            ...(mineOnly && { mine: 'true' }),
            ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
        })
        api.get(`/repository/?${params}`).then(r => {
            setItems(r.data.results || [])
            setCount(r.data.count || 0)
        }).finally(() => setLoading(false))
    }, [page, search, filters, mineOnly])

    useEffect(() => { load() }, [load])

    const totalPages = Math.ceil(count / 12)

    const clearAll = () => { setSearch(''); setFilters({ type: '', year: '', department: '', course: '' }); setMineOnly(false); setPage(1) }
    const hasFilters = search || filters.type || filters.year || filters.department || filters.course || mineOnly

    return (
        <div className="layout">
            <Sidebar />
            <div className="main-content">
                <div className="page-header">
                    <div>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Research Repository</h2>
                        <p style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>{count} output{count !== 1 ? 's' : ''} found</p>
                    </div>
                </div>
                <div className="page-body">
                    {/* Search + Filters */}
                    <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div className="search-bar">
                            <Search size={16} className="search-icon" />
                            <input placeholder="Search by title, author, abstract, keywords…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
                        </div>
                        <div className="filters">
                            <Filter size={16} color="var(--text2)" />
                            {[['type', TYPE_OPTIONS], ['year', YEAR_OPTIONS]].map(([key, opts]) => (
                                <select key={key} value={filters[key]} onChange={e => { setFilters(f => ({ ...f, [key]: e.target.value })); setPage(1) }}>
                                    {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            ))}
                            <input placeholder="Department…" value={filters.department} onChange={e => { setFilters(f => ({ ...f, department: e.target.value })); setPage(1) }} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', padding: '8px 12px', fontSize: '0.85rem', outline: 'none' }} />
                            <input placeholder="Course…" value={filters.course} onChange={e => { setFilters(f => ({ ...f, course: e.target.value })); setPage(1) }} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', padding: '8px 12px', fontSize: '0.85rem', outline: 'none' }} />
                            <button
                                className={`btn btn-sm ${mineOnly ? 'btn-primary' : 'btn-ghost'}`}
                                onClick={() => { setMineOnly(m => !m); setPage(1) }}
                                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                                <User size={14} /> My Submissions
                            </button>
                            {hasFilters && (
                                <button className="btn btn-ghost btn-sm" onClick={clearAll}>Clear</button>
                            )}
                        </div>
                    </div>

                    {loading ? (
                      <div className="skeleton-loader">
                        {/* Repository Grid Skeleton */}
                        <div className="repo-grid">
                          {[Array(6)].map((_, i) => (
                            <div key={i} className="repo-card">
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <div className="skeleton-text h-4 w-24" />
                                <div className="skeleton-text h-4 w-24" />
                              </div>
                              <div className="skeleton-text h-4 w-32" style={{ margin: '8px 0' }} />
                              <div className="skeleton-text h-4 w-full" style={{ margin: '8px 0' }} />
                              <div className="skeleton-text h-4 w-1-2" style={{ margin: '8px 0' }} />
                              <div className="skeleton-text h-4 w-1-2" style={{ margin: '8px 0' }} />
                              <div className="tags-container">
                                {[Array(3)].map((_, j) => (
                                  <span key={j} className="tag skeleton-text h-4 w-20" />
                                ))}
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text2)', marginTop: 4 }}>
                                <span className="skeleton-text h-4 w-1-2" />
                                <span className="skeleton-text h-4 w-1-2" />
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        {/* Pagination Skeleton */}
                        <div className="pagination">
                          <button disabled className="skeleton-text h-8 w-20" />
                          {[Array(5)].map((_, i) => (
                            <button key={i} disabled className="skeleton-text h-8 w-20" />
                          ))}
                          <button disabled className="skeleton-text h-8 w-20" />
                        </div>
                      </div>
                    ) : items.length === 0 ? (
                        <div className="empty-state">
                            <BookOpen style={{ width: 64, height: 64, opacity: 0.2, margin: '0 auto 16px' }} />
                            <h3>No outputs found</h3>
                            <p style={{ marginTop: 6 }}>Try adjusting your search or filters.</p>
                        </div>
                    ) : (
                        <div className="repo-grid">
                            {items.map(item => (
                                <div key={item.id} className="repo-card" onClick={() => navigate(`/repository/${item.id}`)}>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <span className={`badge ${typeColor[item.output_type]}`}>{TYPE_OPTIONS.find(t => t.value === item.output_type)?.label}</span>
                                        {item.is_approved
                                            ? <span className="badge badge-green">Approved</span>
                                            : item.is_rejected
                                                ? <span className="badge" style={{ background: 'rgba(248,81,73,0.12)', color: 'var(--danger)' }}>Rejected</span>
                                                : <span className="badge badge-yellow">Pending</span>}
                                    </div>
                                    <div className="repo-card-title">{item.title}</div>
                                    <div className="repo-card-abstract">{item.abstract || 'No abstract provided.'}</div>
                                    <div className="repo-card-meta">
                                        <span>👤 {item.author}</span>
                                        <span>📅 {item.year}</span>
                                        <span>🏛 {item.department}</span>
                                        {item.course && <span>📚 {item.course}</span>}
                                    </div>
                                    {item.keywords?.length > 0 && (
                                        <div className="tags-container">
                                            {item.keywords.slice(0, 4).map(k => <span key={k} className="tag">{k}</span>)}
                                            {item.keywords.length > 4 && <span className="tag">+{item.keywords.length - 4}</span>}
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text2)', marginTop: 4 }}>
                                        <span>v{item.current_version} · {item.file_count} file{item.file_count !== 1 ? 's' : ''}</span>
                                        <span>{new Date(item.created_at).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {totalPages > 1 && (
                        <div className="pagination">
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹ Prev</button>
                            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                                const p = i + 1; return (
                                    <button key={p} onClick={() => setPage(p)} className={page === p ? 'active' : ''}>{p}</button>
                                )
                            })}
                            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next ›</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
