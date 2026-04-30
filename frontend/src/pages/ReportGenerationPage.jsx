import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { BarChart3, CalendarRange, CheckCircle, Download, FileSpreadsheet, FileText, Filter, Layers3 } from 'lucide-react'
import Sidebar from '../components/Sidebar'
import api from '../api/axios'

const reportCards = [
  {
    title: 'Repository Summary',
    description: 'A clean overview of total, approved, pending, and rejected research outputs.',
    accent: '#2E7D32',
    icon: FileText,
  },
  {
    title: 'Department Output',
    description: 'Approved research counts grouped by department for meetings and accreditation use.',
    accent: '#0f766e',
    icon: Layers3,
  },
  {
    title: 'Review Status',
    description: 'Approval progress and pending workload for admin review tracking.',
    accent: '#F59E0B',
    icon: CheckCircle,
  },
]

function percent(value, total) {
  if (!total) return 0
  return Math.round((value / total) * 100)
}

export default function ReportGenerationPage() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    api.get('/repository/stats/')
      .then((res) => setStats(res.data))
      .finally(() => setLoading(false))
  }, [])

  const statusRows = useMemo(() => [
    { label: 'Approved', value: stats?.approved ?? 0, color: '#2E7D32' },
    { label: 'Pending', value: stats?.pending ?? 0, color: '#F59E0B' },
    { label: 'Rejected', value: stats?.rejected ?? 0, color: '#C62828' },
  ], [stats])

  const downloadCsv = async () => {
    setExporting(true)
    try {
      const response = await api.get('/repository/export/csv/', { responseType: 'blob' })
      const href = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = href
      link.download = `saliksiklab-report-${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      URL.revokeObjectURL(href)
      toast.success('CSV report generated.')
    } catch {
      toast.error('Unable to generate report.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="main-content">
        <div className="page-header">
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Report Generation</h2>
            <p style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>
              Prepare visual, export-ready summaries for admin review and institutional reporting.
            </p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={downloadCsv} disabled={exporting}>
            <Download size={15} /> {exporting ? 'Generating...' : 'Export CSV'}
          </button>
        </div>

        <div className="page-body dashboard-page">
          <section className="dashboard-hero report-visual-hero">
            <div className="dashboard-hero-copy">
              <span className="dashboard-kicker">Reports</span>
              <h3>Turn repository activity into presentation-ready summaries with one export.</h3>
              <p>Use the visual presets below to understand what each report section highlights before downloading the CSV.</p>
            </div>
            <div className="dashboard-hero-actions">
              <div className="dashboard-hero-stat">
                <span>Report records</span>
                <strong>{loading ? '...' : stats?.total ?? 0}</strong>
              </div>
            </div>
          </section>

          <section className="report-visual-grid">
            <article className="dashboard-panel report-preview-panel">
              <div className="dashboard-panel-head">
                <div>
                  <span className="dashboard-panel-kicker">Printable preview</span>
                  <h3><FileSpreadsheet size={16} /> Repository Summary</h3>
                </div>
                <strong className="dashboard-panel-total">{loading ? '...' : stats?.total ?? 0}</strong>
              </div>
              <div className="report-summary-visual">
                {statusRows.map((item) => (
                  <div key={item.label} className="report-summary-row">
                    <div>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                    <div className="report-summary-track">
                      <span style={{ width: `${percent(item.value, stats?.total ?? 0)}%`, background: item.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="dashboard-panel report-preview-panel">
              <div className="dashboard-panel-head">
                <div>
                  <span className="dashboard-panel-kicker">Top departments</span>
                  <h3><BarChart3 size={16} /> Department Snapshot</h3>
                </div>
              </div>
              <div className="report-dept-bars">
                {(stats?.by_dept || []).slice(0, 5).map((dept, index) => (
                  <div key={`${dept.department}-${index}`} className="report-dept-row">
                    <span>{dept.department || 'Unassigned'}</span>
                    <div className="report-dept-track">
                      <span style={{ width: `${percent(dept.count, stats?.by_dept?.[0]?.count ?? 0)}%` }} />
                    </div>
                    <strong>{dept.count}</strong>
                  </div>
                ))}
                {!loading && (stats?.by_dept || []).length === 0 && (
                  <p className="dashboard-card-copy">No department data available yet.</p>
                )}
              </div>
            </article>
          </section>

          <section className="dashboard-analytics-grid">
            {reportCards.map((report) => {
              const Icon = report.icon
              return (
                <article key={report.title} className="dashboard-panel report-template-card">
                  <div className="report-template-accent" style={{ background: report.accent }} />
                  <div className="dashboard-panel-head">
                    <div>
                      <span className="dashboard-panel-kicker">Template</span>
                      <h3><Icon size={16} /> {report.title}</h3>
                    </div>
                  </div>
                  <p className="dashboard-card-copy">{report.description}</p>
                  <div className="report-meta-row">
                    <span><CalendarRange size={14} /> Date range</span>
                    <span><Filter size={14} /> Status filters</span>
                    <span><Download size={14} /> CSV export</span>
                  </div>
                </article>
              )
            })}
          </section>
        </div>
      </div>
    </div>
  )
}
