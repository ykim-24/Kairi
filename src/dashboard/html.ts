export function renderDashboard(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kairi - Review Quality Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <style>
    :root {
      --bg: #0d1117; --surface: #161b22; --border: #30363d;
      --text: #e6edf3; --muted: #8b949e; --accent: #58a6ff;
      --green: #3fb950; --red: #f85149; --yellow: #d29922; --purple: #bc8cff;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); }
    .header { padding: 20px 32px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 16px; }
    .header h1 { font-size: 20px; font-weight: 600; }
    .header .controls { margin-left: auto; display: flex; gap: 8px; }
    select { background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 6px 12px; font-size: 14px; cursor: pointer; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; padding: 24px 32px; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
    .card h3 { font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
    .stat { font-size: 36px; font-weight: 700; }
    .stat.green { color: var(--green); }
    .stat.red { color: var(--red); }
    .stat.yellow { color: var(--yellow); }
    .delta { font-size: 13px; margin-top: 4px; }
    .delta.positive { color: var(--green); }
    .delta.negative { color: var(--red); }
    .chart-section { padding: 0 32px 24px; }
    .chart-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
    .chart-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
    .chart-card h3 { font-size: 14px; color: var(--muted); margin-bottom: 12px; }
    .chart-card canvas { max-height: 260px; }
    .table-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px; overflow-x: auto; }
    .table-card h3 { font-size: 14px; color: var(--muted); margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { text-align: left; color: var(--muted); font-weight: 500; padding: 8px 12px; border-bottom: 1px solid var(--border); }
    td { padding: 8px 12px; border-bottom: 1px solid var(--border); }
    .bar { height: 8px; border-radius: 4px; background: var(--border); position: relative; }
    .bar-fill { height: 100%; border-radius: 4px; position: absolute; left: 0; top: 0; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 12px; font-weight: 500; }
    .badge-green { background: rgba(63,185,80,0.15); color: var(--green); }
    .badge-red { background: rgba(248,81,73,0.15); color: var(--red); }
    .badge-yellow { background: rgba(210,153,34,0.15); color: var(--yellow); }
    @media (max-width: 768px) {
      .chart-row { grid-template-columns: 1fr; }
      .grid { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Kairi</h1>
    <span style="color: var(--muted)">Review Quality Dashboard</span>
    <div class="controls">
      <select id="repo-filter">
        <option value="">All Repos</option>
      </select>
      <select id="period-filter">
        <option value="day">Daily</option>
        <option value="week" selected>Weekly</option>
        <option value="month">Monthly</option>
      </select>
    </div>
  </div>

  <div class="grid" id="stats-grid"></div>

  <div class="chart-section">
    <div class="chart-row">
      <div class="chart-card">
        <h3>Approval Rate Over Time</h3>
        <canvas id="approval-chart"></canvas>
      </div>
      <div class="chart-card">
        <h3>Reviews &amp; Comments Over Time</h3>
        <canvas id="review-chart"></canvas>
      </div>
    </div>
    <div class="chart-row">
      <div class="chart-card">
        <h3>Approval by Source (Rule vs LLM)</h3>
        <canvas id="source-chart"></canvas>
      </div>
      <div class="chart-card">
        <h3>Approval by Category</h3>
        <canvas id="category-chart"></canvas>
      </div>
    </div>
    <div class="chart-row">
      <div class="chart-card">
        <h3>Severity Distribution</h3>
        <canvas id="severity-chart"></canvas>
      </div>
      <div class="chart-card">
        <h3>Knowledge Base Health</h3>
        <canvas id="kb-chart"></canvas>
      </div>
    </div>
  </div>

  <div class="chart-section">
    <div class="chart-row">
      <div class="table-card" id="repos-table"></div>
      <div class="table-card" id="concepts-table"></div>
    </div>
  </div>

  <script>
    const API = '/dashboard/api/metrics';
    let approvalChart, reviewChart, sourceChart, categoryChart, severityChart, kbChart;
    const chartDefaults = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#8b949e', font: { size: 12 } } } },
      scales: {
        x: { ticks: { color: '#8b949e' }, grid: { color: '#21262d' } },
        y: { ticks: { color: '#8b949e' }, grid: { color: '#21262d' } }
      }
    };

    async function fetchJSON(path) {
      const repo = document.getElementById('repo-filter').value;
      const period = document.getElementById('period-filter').value;
      const params = new URLSearchParams({ period });
      if (repo) params.set('repo', repo);
      const res = await fetch(API + path + '?' + params);
      return res.json();
    }

    function pct(v) { return (v * 100).toFixed(1) + '%'; }
    function delta(v) {
      const sign = v >= 0 ? '+' : '';
      const cls = v >= 0 ? 'positive' : 'negative';
      return '<div class="delta ' + cls + '">' + sign + (v * 100).toFixed(1) + '% vs prev period</div>';
    }

    async function loadStats() {
      const s = await fetchJSON('/summary');
      const grid = document.getElementById('stats-grid');
      const approvalColor = s.approvalRate >= 0.7 ? 'green' : s.approvalRate >= 0.4 ? 'yellow' : 'red';
      grid.innerHTML =
        card('Approval Rate', '<div class="stat ' + approvalColor + '">' + pct(s.approvalRate) + '</div>' + delta(s.approvalRateDelta)) +
        card('Total Reviews', '<div class="stat">' + s.totalReviews + '</div>') +
        card('Avg Comments / Review', '<div class="stat">' + s.avgCommentsPerReview.toFixed(1) + '</div>') +
        card('Avg Review Time', '<div class="stat">' + (s.avgDurationMs / 1000).toFixed(1) + 's</div>') +
        card('LLM Parse Success', '<div class="stat green">' + pct(s.llmParseSuccessRate) + '</div>') +
        card('Avg Tokens / Review', '<div class="stat">' + Math.round(s.avgTokensPerReview).toLocaleString() + '</div>') +
        card('Patterns Recalled / Review', '<div class="stat">' + s.avgPatternsRecalled.toFixed(1) + '</div>') +
        card('Total Feedback', '<div class="stat">' + s.totalFeedback + '</div>');
    }

    function card(title, content) {
      return '<div class="card"><h3>' + title + '</h3>' + content + '</div>';
    }

    async function loadApprovalChart() {
      const data = await fetchJSON('/approval-trend');
      const ctx = document.getElementById('approval-chart').getContext('2d');
      if (approvalChart) approvalChart.destroy();
      approvalChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.map(d => d.date),
          datasets: [{
            label: 'Approval Rate',
            data: data.map(d => d.approvalRate),
            borderColor: '#58a6ff', backgroundColor: 'rgba(88,166,255,0.1)',
            fill: true, tension: 0.3, pointRadius: 4
          }]
        },
        options: { ...chartDefaults, scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, min: 0, max: 1, ticks: { ...chartDefaults.scales.y.ticks, callback: v => (v*100)+'%' } } } }
      });
    }

    async function loadReviewChart() {
      const data = await fetchJSON('/review-trend');
      const ctx = document.getElementById('review-chart').getContext('2d');
      if (reviewChart) reviewChart.destroy();
      reviewChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: data.map(d => d.date),
          datasets: [
            { label: 'Reviews', data: data.map(d => d.reviews), backgroundColor: '#58a6ff', borderRadius: 4, yAxisID: 'y' },
            { label: 'Avg Comments', data: data.map(d => d.avgComments), type: 'line', borderColor: '#bc8cff', yAxisID: 'y1', pointRadius: 3, tension: 0.3 }
          ]
        },
        options: {
          ...chartDefaults,
          scales: {
            x: chartDefaults.scales.x,
            y: { ...chartDefaults.scales.y, position: 'left' },
            y1: { ...chartDefaults.scales.y, position: 'right', grid: { drawOnChartArea: false } }
          }
        }
      });
    }

    async function loadSourceChart() {
      const s = await fetchJSON('/summary');
      const ctx = document.getElementById('source-chart').getContext('2d');
      if (sourceChart) sourceChart.destroy();
      sourceChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Rule Engine', 'LLM'],
          datasets: [{
            label: 'Approval Rate',
            data: [s.approvalRateBySource.rule, s.approvalRateBySource.llm],
            backgroundColor: ['#58a6ff', '#bc8cff'],
            borderRadius: 6
          }]
        },
        options: { ...chartDefaults, indexAxis: 'y', scales: { ...chartDefaults.scales, x: { ...chartDefaults.scales.x, min: 0, max: 1, ticks: { ...chartDefaults.scales.x.ticks, callback: v => (v*100)+'%' } } } }
      });
    }

    async function loadCategoryChart() {
      const s = await fetchJSON('/summary');
      const cats = Object.entries(s.approvalRateByCategory);
      const ctx = document.getElementById('category-chart').getContext('2d');
      if (categoryChart) categoryChart.destroy();
      const colors = ['#58a6ff','#3fb950','#d29922','#f85149','#bc8cff','#f0883e'];
      categoryChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: cats.map(c => c[0]),
          datasets: [{
            label: 'Approval Rate',
            data: cats.map(c => c[1]),
            backgroundColor: cats.map((_, i) => colors[i % colors.length]),
            borderRadius: 6
          }]
        },
        options: { ...chartDefaults, scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, min: 0, max: 1, ticks: { ...chartDefaults.scales.y.ticks, callback: v => (v*100)+'%' } } } }
      });
    }

    async function loadSeverityChart() {
      const s = await fetchJSON('/summary');
      const ctx = document.getElementById('severity-chart').getContext('2d');
      if (severityChart) severityChart.destroy();
      severityChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Error', 'Warning', 'Info'],
          datasets: [{
            data: [s.severityDistribution.error, s.severityDistribution.warning, s.severityDistribution.info],
            backgroundColor: ['#f85149', '#d29922', '#58a6ff'],
            borderWidth: 0
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#8b949e' } } } }
      });
    }

    async function loadKBChart() {
      const kb = await fetchJSON('/knowledge-base');
      const ctx = document.getElementById('kb-chart').getContext('2d');
      if (kbChart) kbChart.destroy();
      kbChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Approved', 'Rejected', 'Pending'],
          datasets: [{
            data: [kb.approved, kb.rejected, kb.pending],
            backgroundColor: ['#3fb950', '#f85149', '#8b949e'],
            borderWidth: 0
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#8b949e' } } } }
      });
    }

    async function loadReposTable() {
      const repos = await fetch(API + '/repos').then(r => r.json());
      const container = document.getElementById('repos-table');
      const repoSelect = document.getElementById('repo-filter');
      // populate filter dropdown
      repos.forEach(r => {
        if (!repoSelect.querySelector('option[value="' + r.repo + '"]')) {
          const opt = document.createElement('option');
          opt.value = r.repo; opt.textContent = r.repo;
          repoSelect.appendChild(opt);
        }
      });
      let html = '<h3>Repository Breakdown</h3><table><tr><th>Repo</th><th>Reviews</th><th>Avg Comments</th><th>Approval</th><th>Trend</th></tr>';
      for (const r of repos) {
        const color = r.approvalRate >= 0.7 ? 'green' : r.approvalRate >= 0.4 ? 'yellow' : 'red';
        const sparkline = r.trend.map(v => '<span style="display:inline-block;width:8px;height:' + Math.max(4, v*24) + 'px;background:var(--accent);border-radius:2px;margin:0 1px;vertical-align:bottom"></span>').join('');
        html += '<tr><td>' + r.repo + '</td><td>' + r.totalReviews + '</td><td>' + r.avgCommentsPerReview + '</td><td><span class="badge badge-' + color + '">' + pct(r.approvalRate) + '</span></td><td>' + sparkline + '</td></tr>';
      }
      html += '</table>';
      container.innerHTML = html;
    }

    async function loadConceptsTable() {
      const repo = document.getElementById('repo-filter').value;
      const params = repo ? '?repo=' + repo : '';
      const concepts = await fetch(API + '/concepts' + params).then(r => r.json());
      const container = document.getElementById('concepts-table');
      let html = '<h3>Concept Approval Rates</h3><table><tr><th>Concept</th><th>Total</th><th>Rate</th><th></th></tr>';
      for (const c of concepts.slice(0, 15)) {
        const color = c.rate >= 0.7 ? '#3fb950' : c.rate >= 0.4 ? '#d29922' : '#f85149';
        html += '<tr><td>' + c.concept + '</td><td>' + c.total + '</td><td>' + pct(c.rate) + '</td><td><div class="bar" style="width:120px"><div class="bar-fill" style="width:' + (c.rate*100) + '%;background:' + color + '"></div></div></td></tr>';
      }
      if (concepts.length === 0) html += '<tr><td colspan="4" style="color:var(--muted)">No concept data yet</td></tr>';
      html += '</table>';
      container.innerHTML = html;
    }

    async function loadAll() {
      await Promise.all([
        loadStats(), loadApprovalChart(), loadReviewChart(),
        loadSourceChart(), loadCategoryChart(), loadSeverityChart(),
        loadKBChart(), loadReposTable(), loadConceptsTable()
      ]);
    }

    document.getElementById('repo-filter').addEventListener('change', loadAll);
    document.getElementById('period-filter').addEventListener('change', loadAll);
    loadAll();
    setInterval(loadAll, 60000); // auto-refresh every minute
  </script>
</body>
</html>`;
}
