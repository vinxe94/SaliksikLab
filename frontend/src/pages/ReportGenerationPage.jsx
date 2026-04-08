import { FileText, Download, CalendarRange, Filter } from 'lucide-react'
import Sidebar from '../components/Sidebar'

const reportCards = [
  {
    title: 'Submission Summary',
    description: 'Generate a compact report of uploaded research outputs grouped by status and date.',
  },
  {
    title: 'Department Performance',
    description: 'Export department-level output counts for review, meetings, and internal reporting.',
  },
  {
    title: 'Approval Audit',
    description: 'Review approved, pending, and rejected entries in a print-ready summary format.',
  },
]

export default function ReportGenerationPage() {
  return (
    <div className="layout">
      <Sidebar />
      <div className="main-content">
        <div className="page-header">
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Report Generation</h2>
            <p style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>
              Prepare export-ready repository summaries for admin review and institutional reporting.
            </p>
          </div>
          <button className="btn btn-primary btn-sm">
            <Download size={15} /> Generate Report
          </button>
        </div>

        <div className="page-body dashboard-page">
          <section className="dashboard-hero">
            <div className="dashboard-hero-copy">
              <span className="dashboard-kicker">Reports</span>
              <h3>Build clean summaries for repository activity, review status, and department output.</h3>
              <p>Use presets below as starting points for downloadable reports and presentation-ready exports.</p>
            </div>
            <div className="dashboard-hero-actions">
              <div className="dashboard-hero-stat">
                <span>Available presets</span>
                <strong>{reportCards.length}</strong>
              </div>
            </div>
          </section>

          <section className="dashboard-analytics-grid">
            {reportCards.map((report) => (
              <article key={report.title} className="dashboard-panel">
                <div className="dashboard-panel-head">
                  <div>
                    <span className="dashboard-panel-kicker">Template</span>
                    <h3><FileText size={16} /> {report.title}</h3>
                  </div>
                </div>
                <p className="dashboard-card-copy">{report.description}</p>
                <div className="report-meta-row">
                  <span><CalendarRange size={14} /> Date range</span>
                  <span><Filter size={14} /> Filtered export</span>
                </div>
              </article>
            ))}
          </section>
        </div>
      </div>
    </div>
  )
}
