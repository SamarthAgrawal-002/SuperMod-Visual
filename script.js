const API_URL = '/api';

// STATE
let state = {
    view: 'dashboard', // dashboard, feed, users, logs
    posts: [],
    selectedPosts: new Set(),
    bulkMode: false,
    filters: { status: '' },
    currentUserForAnalysis: null
};

// INIT
document.addEventListener('DOMContentLoaded', () => {
    init();
});

async function init() {
    loadDashboard();

    // Add keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'a' && state.selectedPosts.size > 0) bulkAction('approved');
        if (e.key === 'r' && state.selectedPosts.size > 0) bulkAction('rejected');
    });
}

// NAVIGATION
function switchView(viewName) {
    state.view = viewName;

    // UI Updates
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    document.getElementById(`view-${viewName}`).style.display = 'block';

    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`.nav-item[onclick="switchView('${viewName}')"]`)?.classList.add('active');

    // Logic
    if (viewName === 'dashboard') loadDashboard();
    if (viewName === 'feed') loadFeed();
    if (viewName === 'users') loadUsers();
    if (viewName === 'logs') loadLogs();
}

// LOGS LOGIC
async function loadLogs() {
    const container = document.getElementById('logs-list');
    container.innerHTML = '<div style="padding:20px; text-align:center">Loading logs...</div>';

    try {
        const res = await fetch(`${API_URL}/logs`);
        const logs = await res.json();

        container.innerHTML = logs.map(log => `
            <div class="log-item ${log.action.includes('ban') ? 'ban' : (log.action.includes('approve') ? 'approved' : '')}">
                <div class="log-details">
                    <strong>${log.action.toUpperCase()}</strong>
                    <span style="color:var(--text-muted)"> - ${log.details}</span>
                </div>
                <div class="log-time">${new Date(log.timestamp).toLocaleString()}</div>
            </div>
        `).join('');
    } catch (err) { console.error(err); }
}

// USER ANALYSIS MODAL
const modal = document.getElementById('analysis-modal');

function closeModal() {
    modal.close();
}

async function analyzeUser(id) {
    state.currentUserForAnalysis = id;
    modal.showModal();
    const body = document.getElementById('modal-body');
    const banBtn = document.getElementById('modal-ban-btn');

    body.innerHTML = '<div style="text-align:center; padding:40px;">🧠 AI is analyzing user profile...</div>';
    banBtn.onclick = () => banUser(id);

    try {
        const res = await fetch(`${API_URL}/users/${id}/analyze`, { method: 'POST' });
        const data = await res.json();

        body.innerHTML = `
            <div style="display:flex; gap:20px; margin-bottom:20px;">
                <div style="flex:1; background:rgba(255,255,255,0.05); padding:15px; border-radius:8px;">
                    <div style="font-size:12px; color:var(--text-muted)">RISK LEVEL</div>
                    <div style="font-size:24px; font-weight:bold; color:${data.riskLevel === 'High' ? 'var(--danger)' : 'var(--success)'}">${data.riskLevel}</div>
                </div>
                <div style="flex:2; background:rgba(255,255,255,0.05); padding:15px; border-radius:8px;">
                    <div style="font-size:12px; color:var(--text-muted)">RECOMMENDATION</div>
                    <div style="font-size:16px;">${data.recommendation}</div>
                </div>
            </div>
            <div style="margin-bottom:20px;">
                <h4 style="color:var(--accent); margin-bottom:10px;">Psychological Profile</h4>
                <p>${data.psychProfile}</p>
            </div>
            <div>
                <h4 style="color:var(--accent); margin-bottom:10px;">Summary</h4>
                <p>${data.summary}</p>
            </div>
        `;
    } catch (err) {
        body.innerHTML = '<p style="color:var(--danger)">Analysis failed.</p>';
    }
}

async function banUser(id) {
    if (!confirm('Are you sure you want to ban this user?')) return;

    try {
        await fetch(`${API_URL}/users/${id}/ban`, { method: 'POST' });
        closeModal();
        alert('User banned successfully.');
        loadUsers(); // Refresh list
    } catch (err) { alert('Ban failed'); }
}

// DASHBOARD LOGIC
async function loadDashboard() {
    try {
        const res = await fetch(`${API_URL}/stats`);
        const stats = await res.json();

        animateValue('kpi-users', stats.users);
        animateValue('kpi-posts', stats.posts);
        animateValue('kpi-pending', stats.pending);
        animateValue('kpi-flagged', stats.flagged);

        renderChart(stats.trends);
    } catch (err) { console.error(err); }
}

function renderChart(trends) {
    const container = document.getElementById('activity-chart');
    container.innerHTML = '';

    const maxVal = Math.max(...trends.map(t => t.value));

    trends.forEach(point => {
        const heightPct = (point.value / maxVal) * 100;
        const bar = document.createElement('div');
        bar.className = 'chart-bar';
        bar.style.height = `${heightPct}%`;
        bar.setAttribute('data-label', point.day);
        container.appendChild(bar);
    });
}

// FEED LOGIC
async function loadFeed() {
    const container = document.getElementById('feed-container');
    container.innerHTML = '<div style="padding:40px; text-align:center; color:#666">Loading Feed...</div>';

    const url = state.filters.status ? `${API_URL}/posts?status=${state.filters.status}` : `${API_URL}/posts`;
    if (state.filters.status === 'flagged') {
        // Special logic for flagged if backend doesn't support query param perfectly, but assuming it filters by moderationStatus or we filter client side.
        // For now let's just fetch all and filter client side if 'flagged' (or use pending)
        // Actually, let's keep it simple: filterFeed sets state.filters.status
    }

    try {
        const res = await fetch(url);
        state.posts = await res.json();
        renderFeed();
    } catch (err) { console.error(err); }
}

function filterFeed(status) {
    state.filters.status = status;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    // rudimentary active tab logic - improved version would select by text or ID
    event.target.classList.add('active');
    loadFeed();
}

function renderFeed() {
    const container = document.getElementById('feed-container');
    container.innerHTML = '';

    state.posts.forEach(post => {
        const ai = post.aiAnalysis ? JSON.parse(post.aiAnalysis) : null;
        const isSelected = state.selectedPosts.has(post.id);

        // Skip if filtering for 'flagged' and not flagged (client side filter)
        if (state.filters.status === 'flagged' && (!ai || !ai.flagged)) return;

        const card = document.createElement('div');
        card.className = `post-card ${isSelected ? 'selected' : ''}`;
        card.onclick = (e) => toggleSelection(post.id, e);

        card.innerHTML = `
            <div class="post-header">
                <div class="user-snippet">
                    <img src="${post.avatar}" class="avatar-small">
                    <div>
                        <div class="username">${post.username}</div>
                        <div class="time">${new Date(post.timestamp).toLocaleString()}</div>
                    </div>
                </div>
                <div class="status-badge status-${post.moderationStatus}" style="color:var(--text-muted); font-size:12px; font-weight:700; text-transform:uppercase">${post.moderationStatus}</div>
            </div>
            <div class="post-body">
                ${post.content}
                ${post.image ? `<div style="margin-top:10px;"><img src="${post.image}" style="max-width:100%; border-radius:6px; opacity:0.8;"></div>` : ''}
            </div>
            ${ai && ai.flagged ? `<div style="background:rgba(239,68,68,0.1); padding:8px; border-radius:4px; font-size:12px; color:var(--danger); margin-bottom:10px;">⚠️ Unsafe: ${ai.reason}</div>` : ''}
            
            <div class="post-actions">
                ${state.bulkMode ? `<input type="checkbox" ${isSelected ? 'checked' : ''} style="pointer-events:none">` : ''}
                <button class="btn-icon" onclick="toggleRisk(${post.id}, event)" title="Toggle High Risk" style="color:${post.isManualHighRisk ? 'var(--warning)' : 'var(--text-muted)'}">⚡</button>
                <div style="flex:1"></div>
                <button class="btn btn-approve" onclick="updateStatus(${post.id}, 'approved'); event.stopPropagation();">Approve</button>
                <button class="btn btn-reject" onclick="updateStatus(${post.id}, 'rejected'); event.stopPropagation();">Reject</button>
            </div>
        `;
        container.appendChild(card);
    });
}

// BULK ACTIONS
function toggleBulkMode() {
    state.bulkMode = !state.bulkMode;
    state.selectedPosts.clear();
    renderFeed();
    updateBulkToolbar();
}

function toggleSelection(id, event) {
    if (!state.bulkMode) return;

    if (state.selectedPosts.has(id)) state.selectedPosts.delete(id);
    else state.selectedPosts.add(id);

    renderFeed(); // Re-render to show selection state
    updateBulkToolbar();
}

function updateBulkToolbar() {
    const toolbar = document.getElementById('bulk-toolbar');
    const countEl = document.getElementById('selected-count');

    if (state.bulkMode && state.selectedPosts.size > 0) {
        toolbar.classList.remove('hidden');
        countEl.textContent = `${state.selectedPosts.size} selected`;
    } else {
        toolbar.classList.add('hidden');
    }
}

async function bulkAction(status) {
    const ids = Array.from(state.selectedPosts);
    if (ids.length === 0) return;

    try {
        await fetch(`${API_URL}/posts/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, status })
        });

        // Reset
        state.selectedPosts.clear();
        state.bulkMode = false;
        updateBulkToolbar();
        loadFeed(); // Refresh

    } catch (err) { alert('Bulk action failed'); }
}

async function updateStatus(id, status) {
    await fetch(`${API_URL}/posts/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
    });
    // Remove from UI or update status (just reload for simplicity in v2 prototype)
    loadFeed();
}

// USERS LOGIC
async function loadUsers() {
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';

    try {
        const res = await fetch(`${API_URL}/users`);
        const users = await res.json();

        tbody.innerHTML = users.map(u => `
            <tr>
                <td>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <img src="${u.avatar}" class="avatar-small">
                        <strong>${u.username}</strong>
                    </div>
                </td>
                <td>
                    <div style="display:flex; align-items:center; gap:5px;">
                        <div style="flex:1; height:4px; background:#333; border-radius:2px; width:50px;">
                            <div style="width:${u.trustScore}%; height:100%; background:${u.trustScore > 80 ? 'var(--success)' : 'var(--warning)'}; border-radius:2px;"></div>
                        </div>
                        <span style="font-size:11px; font-family:var(--font-mono)">${u.trustScore}</span>
                    </div>
                </td>
                <td><span style="color:${u.status === 'banned' ? 'var(--danger)' : 'var(--text-muted)'}">${u.status}</span></td>
                <td style="color:var(--text-muted); font-size:12px;">${new Date(u.joinedAt).toLocaleDateString()}</td>
                <td><button class="btn btn-secondary btn-sm" onclick="analyzeUser(${u.id})">Analyze</button></td>
            </tr>
        `).join('');
    } catch (err) { console.error(err); }
}

// UTILS
function animateValue(id, value) {
    const obj = document.getElementById(id);
    obj.textContent = value; // Simplification of animation
}

async function toggleRisk(id, event) {
    event.stopPropagation();
    try {
        await fetch(`${API_URL}/posts/${id}/risk`, { method: 'POST' });
        loadFeed();
    } catch (err) { console.error(err); }
}

// SETTINGS & REPORT
function openReportModal() {
    document.getElementById('report-modal').showModal();
    generateReport();
}

async function generateReport() {
    const body = document.getElementById('report-body');
    body.innerHTML = 'Generating report...';

    try {
        const res = await fetch(`${API_URL}/report/generate`, { method: 'POST' });
        const data = await res.json();

        body.innerHTML = `
            <div id="pdf-content" style="padding:20px; background:white; color:black; border-radius:8px;">
                <div style="text-align:center; margin-bottom:30px; border-bottom:2px solid #333; padding-bottom:10px;">
                    <h1 style="margin:0;">Executive Moderation Report</h1>
                    <div style="color:#666; font-size:12px;">Generated: ${new Date(data.timestamp).toLocaleString()}</div>
                </div>
                
                <div class="report-section">
                    <h3 class="report-title">System Statistics</h3>
                    <div class="report-stat"><strong>Total Posts Evaluated:</strong> <span>${data.stats.total}</span></div>
                    <div class="report-stat"><strong>Pending Review:</strong> <span>${data.stats.pending}</span></div>
                    <div class="report-stat"><strong>High Risk Items:</strong> <span>${data.stats.highRisk}</span></div>
                    <div class="report-stat"><strong>Banned Users:</strong> <span>${data.bannedUsers}</span></div>
                </div>

                <div class="report-section">
                    <h3 class="report-title">AI Executive Summary</h3>
                    <div class="report-summary">
                        "${data.summary}"
                    </div>
                </div>
                
                <div style="margin-top:40px; text-align:center; font-size:10px; color:#999;">
                    CONFIDENTIAL - INTERNAL USE ONLY
                </div>
            </div>
        `;
    } catch (err) { body.innerHTML = 'Failed to generate report.'; }
}

function downloadPDF() {
    const element = document.getElementById('pdf-content');
    html2pdf(element);
}
