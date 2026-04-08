import { ChartColumn, Gauge, Layers3, TrendingUp } from 'lucide-react'
import Sidebar from '../components/Sidebar'

const analyticsHighlights = [
  {
    title: 'Repository Growth',
    value: '24%',
    detail: 'Estimated increase in submissions this term compared with the prior period.',
    icon: TrendingUp,
  },
  {
    title: 'Review Efficiency',
    value: '82%',
    detail: 'Average moderation completion rate across recent submissions.',
    icon: Gauge,
  },
  {
    title: 'Department Coverage',
    value: '12',
    detail: 'Active departments contributing outputs into the repository.',
    icon: Layers3,
  },
]

export default function AnalyticsPage() {
  return (
    <div className="layout">
      <Sidebar />
      <div className="main-content">
        <div className="page-header">
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Analytics</h2>
            <p style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>
              Review higher-level metrics and trends from repository activity in one place.
            </p>
          </div>
        </div>

        <div className="page-body dashboard-page">
          <section className="dashboard-hero">
            <div className="dashboard-hero-copy">
              <span className="dashboard-kicker">Insights</span>
              <h3>Monitor repository momentum, review performance, and contribution coverage.</h3>
              <p>These high-level analytics help surface where research activity is strongest and where intervention may be needed.</p>
            </div>
            <div className="dashboard-hero-actions">
              <div className="dashboard-hero-stat">
                <span>Insight cards</span>
                <strong>{analyticsHighlights.length}</strong>
              </div>
            </div>
          </section>

          <section className="dashboard-analytics-grid">
            {analyticsHighlights.map((item) => {
              const Icon = item.icon
              return (
                <article key={item.title} className="dashboard-panel">
                  <div className="dashboard-panel-head">
                    <div>
                      <span className="dashboard-panel-kicker">Metric</span>
                      <h3><Icon size={16} /> {item.title}</h3>
                    </div>
                    <strong className="dashboard-panel-total">{item.value}</strong>
                  </div>
                  <p className="dashboard-card-copy">{item.detail}</p>
                </article>
              )
            })}

            <article className="dashboard-panel dashboard-panel-wide">
              <div className="dashboard-panel-head">
                <div>
                  <span className="dashboard-panel-kicker">Overview</span>
                  <h3><ChartColumn size={16} /> Analytics Workspace</h3>
                </div>
              </div>
              <p className="dashboard-card-copy">
                This section is ready for deeper analytics modules such as trend visualizations, exportable charts,
                and performance breakdowns by department, adviser, or output type.
              </p>
            </article>
          </section>
        </div>
      </div>
    </div>
  )
}
