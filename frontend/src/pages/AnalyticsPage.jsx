import { useEffect, useMemo, useState } from 'react'
import { Activity, BarChart3, CheckCircle, Clock, Gauge, GraduationCap, Layers3, XCircle } from 'lucide-react'
import { Bar, Pie } from 'react-chartjs-2'
import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from 'chart.js'
import Sidebar from '../components/Sidebar'
import api from '../api/axios'

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const palette = ['#1b5e20', '#2f855a', '#0f766e', '#b7791f', '#7c3aed', '#0369a1', '#be123c', '#4b5563']
const coursePalette = ['#0f766e', '#0369a1', '#7c3aed', '#be123c', '#b7791f', '#2E7D32', '#c2410c', '#4b5563']

function percent(value, total) {
  if (!total) return 0
  return Math.round((value / total) * 100)
}

function labelType(type = 'other') {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/repository/stats/')
      .then((res) => setStats(res.data))
      .finally(() => setLoading(false))
  }, [])

  const statusSeries = useMemo(() => [
    { label: 'Approved', value: stats?.approved ?? 0, color: '#2E7D32', icon: CheckCircle },
    { label: 'Pending', value: stats?.pending ?? 0, color: '#F59E0B', icon: Clock },
    { label: 'Rejected', value: stats?.rejected ?? 0, color: '#C62828', icon: XCircle },
  ], [stats])

  const topDept = stats?.by_dept?.[0]
  const topCourse = stats?.by_course?.[0]

  const statusData = {
    labels: statusSeries.map((item) => item.label),
    datasets: [{
      data: statusSeries.map((item) => item.value),
      backgroundColor: statusSeries.map((item) => item.color),
      borderColor: '#ffffff',
      borderWidth: 4,
    }],
  }

  const departmentData = {
    labels: (stats?.by_dept || []).map((item) => item.department || 'Unassigned'),
    datasets: [{
      label: 'Approved outputs',
      data: (stats?.by_dept || []).map((item) => item.count),
      backgroundColor: palette,
      borderRadius: 8,
    }],
  }

  const courseData = {
    labels: (stats?.by_course || []).map((item) => item.course || 'Unassigned'),
    datasets: [{
      label: 'Outputs',
      data: (stats?.by_course || []).map((item) => item.count),
      backgroundColor: (stats?.by_course || []).map((_, index) => coursePalette[index % coursePalette.length]),
      borderRadius: 8,
    }],
  }

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#5f6b5c', font: { size: 11 } } },
      y: { beginAtZero: true, grid: { color: 'rgba(95, 107, 92, 0.12)' }, ticks: { precision: 0, color: '#5f6b5c' } },
    },
  }

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      animateRotate: true,
      animateScale: true,
      duration: 900,
      easing: 'easeOutQuart',
    },
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 14 } },
    },
  }

  return (
    <div className="layout">
      <Sidebar />
      <div className="main-content">
        <div className="page-header">
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Analytics</h2>
            <p style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>
              Visual snapshot of repository status, department coverage, and course output distribution.
            </p>
          </div>
        </div>

        <div className="page-body dashboard-page">
          <section className="dashboard-hero analytics-visual-hero">
            <div className="dashboard-hero-copy">
              <span className="dashboard-kicker">Live insights</span>
              <h3>See what is approved, what needs attention, and where research activity is strongest.</h3>
              <p>These visuals use the current repository statistics so admins can scan performance quickly.</p>
            </div>
            <div className="dashboard-hero-actions">
              <div className="dashboard-hero-stat">
                <span>Total records</span>
                <strong>{loading ? '...' : stats?.total ?? 0}</strong>
              </div>
            </div>
          </section>

          <div className="stat-grid">
            {statusSeries.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.label} className="stat-card dashboard-stat-card analytics-stat-card">
                  <span className="analytics-stat-icon" style={{ color: item.color }}><Icon size={18} /></span>
                  <span className="stat-value" style={{ color: item.color }}>{loading ? '...' : item.value}</span>
                  <span className="stat-label">{item.label}</span>
                  <span className="dashboard-stat-meta">{percent(item.value, stats?.total ?? 0)}% of repository records</span>
                </div>
              )
            })}
            <div className="stat-card dashboard-stat-card analytics-stat-card">
              <span className="analytics-stat-icon"><Layers3 size={18} /></span>
              <span className="stat-value">{loading ? '...' : stats?.by_dept?.length ?? 0}</span>
              <span className="stat-label">Departments</span>
              <span className="dashboard-stat-meta">Active approved research sources</span>
            </div>
          </div>

          <section className="analytics-visual-grid">
            <article className="dashboard-panel analytics-chart-panel">
              <div className="dashboard-panel-head">
                <div>
                  <span className="dashboard-panel-kicker">Review status</span>
                  <h3><Gauge size={16} /> Approval Breakdown</h3>
                </div>
              </div>
              <div className="analytics-doughnut-wrap">
                <Pie data={statusData} options={pieOptions} />
              </div>
            </article>

            <article className="dashboard-panel analytics-chart-panel analytics-wide-panel">
              <div className="dashboard-panel-head">
                <div>
                  <span className="dashboard-panel-kicker">Departments</span>
                  <h3><BarChart3 size={16} /> Approved Outputs by Department</h3>
                </div>
                {topDept && <strong className="dashboard-panel-total">{topDept.count}</strong>}
              </div>
              <div className="analytics-chart-height">
                <Bar data={departmentData} options={barOptions} />
              </div>
            </article>

            <article className="dashboard-panel analytics-chart-panel analytics-wide-panel">
              <div className="dashboard-panel-head">
                <div>
                  <span className="dashboard-panel-kicker">Courses</span>
                  <h3><GraduationCap size={16} /> Distribution of Outputs by Courses</h3>
                </div>
                {topCourse && <strong className="dashboard-panel-total">{topCourse.count}</strong>}
              </div>
              <div className="analytics-chart-height">
                <Bar data={courseData} options={barOptions} />
              </div>
            </article>

            <article className="dashboard-panel analytics-chart-panel">
              <div className="dashboard-panel-head">
                <div>
                  <span className="dashboard-panel-kicker">Output types</span>
                  <h3><Activity size={16} /> Repository Mix</h3>
                </div>
              </div>
              <div className="analytics-type-list">
                {(stats?.by_type || []).map((item, index) => (
                  <div key={item.output_type || index} className="analytics-type-row">
                    <span>{labelType(item.output_type)}</span>
                    <div className="analytics-mini-track">
                      <span style={{ width: `${percent(item.count, stats?.total ?? 0)}%`, background: palette[index % palette.length] }} />
                    </div>
                    <strong>{item.count}</strong>
                  </div>
                ))}
                {!loading && (stats?.by_type || []).length === 0 && (
                  <p className="dashboard-card-copy">No output type data available yet.</p>
                )}
              </div>
            </article>
          </section>
        </div>
      </div>
    </div>
  )
}
