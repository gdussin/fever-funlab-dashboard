// =========================================================
// JSON DATA CONNECTION - DO NOT REMOVE
// This dashboard dynamically loads current-board.json.
// Dashboard values must not be hard-coded.
// =========================================================
const URL = './current-board.json';

/* =========================================================
   CONFIGURATION AND CONSTANTS
   Completed statuses, progress weights, and chart colours
========================================================= */
const DONE = ['5. Live', '6. Verified & Communicated'];
const W = {
    '1. Incoming': 0,
    '2. To Review': 10,
    '3. Backlog': 25,
    '4. In Progress': 60,
    '5. Live': 90,
    '6. Verified & Communicated': 100
};
const COL = ['#ff2f92', '#2457ff', '#ffd400', '#7b2cff', '#00a878', '#c8ff00'];
const MILESTONE_TIMELINES = {
    'AU Rollout': [
        { label: 'Go/No Go', date: '2027-01-18', displayDate: '18 Jan' },
        { label: 'Go Live', date: '2027-02-04', displayDate: '4 Feb' }
    ],
    'USA Rollout': [
        { label: 'UAT', date: '2027-02-04', displayDate: '4–17 Feb' },
        { label: 'Go/No Go', date: '2027-02-18', displayDate: '18 Feb' },
        { label: 'Go Live', date: '2027-03-09', displayDate: '9 Mar' }
    ]
};

/* =========================================================
   DASHBOARD DATA
   Current board data, prepared cards, list order, and active filters
========================================================= */
let D, C = [], ORDER = [], ss = [], ts = [], ys = [];
let fileLastModified = null;

const esc = s =>
    String(s || '').replace(/[&<>"']/g, m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[m]));

/* =========================================================
   TRELLO HELPER FUNCTIONS
   Read milestone, stream, ticket-type labels, and priority metadata
========================================================= */
function labels(c, p) {
    return (c.labels || [])
        .map(x => (x.name || '').match(new RegExp('^' + p + '\\s*[|:]\\s*(.+)$', 'i')))
        .filter(Boolean)
        .map(x => x[1].trim());
}

function priority(c) {
    for (const x of c.pluginData || []) {
        try {
            let z = JSON.parse(x.value || '{}');
            if (z.priority) return z.priority[0].toUpperCase() + z.priority.slice(1);
        } catch { }
    }
    return 'Missing';
}

/* =========================================================
   DATA PREPARATION
   Convert the Trello board response into dashboard ticket data
========================================================= */
function prep(d, lastModified) {
    D = d;
    fileLastModified = lastModified ? new Date(lastModified) : null;
    let L = Object.fromEntries((d.lists || []).map(x => [x.id, x.name]));
    ORDER = (d.lists || []).filter(x => !x.closed).map(x => x.name);
    C = (d.cards || [])
        .filter(c => !c.closed && !c.isTemplate)
        .map(c => ({
            name: c.name,
            url: c.url || c.shortUrl,
            status: L[c.idList] || 'Unknown',
            m: labels(c, 'M'),
            s: labels(c, 'S'),
            t: labels(c, 'T'),
            priority: priority(c),
            owners: c.idMembers || []
        }));

    render();
}

/* =========================================================
   TICKET TYPE LOGIC
   Normalize ticket types and manage the type filter chips
========================================================= */
function typeName(x) {
    let v = String(x || '').trim();
    if (/hyper.?care/i.test(v)) return 'Hypercare';
    if (/^bug$/i.test(v)) return 'Bug';
    if (/feature/i.test(v)) return 'Feature';
    if (/optimi[sz]ation/i.test(v)) return 'Optimization';
    return v || 'Missing';
}

function types(c) {
    return c.t && c.t.length ? [...new Set(c.t.map(typeName))] : ['Missing'];
}

function toggleType(v) {
    if (v === 'All') {
        ys.splice(0);
    } else {
        let i = ys.indexOf(v);
        i < 0 ? ys.push(v) : ys.splice(i, 1);
    }
    render();
}

function typeChips() {
    let a = ['All', 'Hypercare', 'Bug', 'Feature', 'Optimization', 'Missing'];
    return '<div class="chips">' + a.map(x =>
        `<button class="chip ${(x === 'All' && !ys.length) || ys.includes(x) ? 'on' : ''}" onclick="toggleType('${x}')">${x}</button>`
    ).join('') + '</div>';
}

/* =========================================================
   MILESTONE LOGIC
   Identify BAU and available milestones
========================================================= */
const bau = c => !c.m.length || c.m.some(x => /BAU/i.test(x));
const ms = () => [...new Set(C.flatMap(c => c.m).filter(x => !/BAU/i.test(x)))].sort();

/* =========================================================
   FILTERS
   Match tickets to selected milestones and update filter chips
========================================================= */
function match(c, a) {
    return !a.length || a.some(x => x === 'BAU' ? bau(c) : c.m.includes(x));
}

function toggle(k, v) {
    let a = k === 's' ? ss : ts;
    if (v === 'All') {
        a.splice(0);
    } else {
        let i = a.indexOf(v);
        i < 0 ? a.push(v) : a.splice(i, 1);
    }
    render();
}

function chips(k, a) {
    return '<div class="chips">' + ['All', ...ms(), 'BAU'].map(x =>
        `<button class="chip ${(x === 'All' && !a.length) || a.includes(x) ? 'on' : ''}" onclick="toggle('${k}','${esc(x)}')">${esc(x)}</button>`
    ).join('') + '</div>';
}

/* =========================================================
   CHARTS / BAR RENDERING
   Build colored bars for ticket counts by category
========================================================= */
function bars(a, ord) {
    let ks = ord ? ord.filter(x => a.includes(x)) : [...new Set(a)].sort();
    let mx = Math.max(1, ...ks.map(k => a.filter(x => x === k).length));

    return ks.map((k, i) => {
        let n = a.filter(x => x === k).length;
        return `<div class="bar"><span>${esc(k)}</span><div class="track"><div class="fill" style="width:${100 * n / mx}%;background:${COL[i % COL.length]}"></div></div><b>${n}</b></div>`;
    }).join('');
}

/* =========================================================
   MILESTONE CARD RENDERING
   Create each milestone's progress and risk summary card
========================================================= */
function sydneyToday() {
    const parts = new Intl.DateTimeFormat('en-AU', {
        timeZone: 'Australia/Sydney',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());
    const date = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return Date.UTC(Number(date.year), Number(date.month) - 1, Number(date.day));
}

function milestoneDaysLeft(date, today = sydneyToday()) {
    const days = (Date.parse(`${date}T00:00:00Z`) - today) / 86400000;
    if (days < 0) return 'Passed';
    return `${days} ${days === 1 ? 'day' : 'days'} left`;
}

function updateMilestoneDays() {
    const today = sydneyToday();

    app.querySelectorAll('[data-milestone-date]').forEach(element => {
        element.textContent = milestoneDaysLeft(element.getAttribute('data-milestone-date'), today);
    });
}

function updateMissingOwnerActions() {
    const section = [...app.querySelectorAll('details.issue')].find(details =>
        details.querySelector('summary span').textContent === 'Missing Owner'
    );
    const cards = C.filter(card => !DONE.includes(card.status) && !card.owners.length);

    section.querySelector('.pill').textContent = cards.length;
    section.querySelectorAll('div').forEach(row => row.remove());
    section.insertAdjacentHTML('beforeend', cards.map(card =>
        `<div><a href="${esc(card.url)}" target="_blank">${esc(card.name)}</a><a href="${esc(card.url)}" target="_blank" style="float:right">Open in Trello ↗</a></div>`
    ).join(''));
}

function card(n, a, b = false) {
    let prog = Math.round(a.reduce((z, c) => z + (W[c.status] ?? 0), 0) / Math.max(1, a.length));
    let rem = a.filter(c => !DONE.includes(c.status)).length;
    let timeline = MILESTONE_TIMELINES[n];

    return `<article class="box mile ${b ? 'bau' : ''}"><div class="head"><h3>${esc(n)}</h3></div><div class="score">${prog}%</div><div class="muted">status-weighted progress</div><div class="progress"><i style="width:${prog}%"></i></div>${timeline ? `<div class="milestone-dates">${timeline.map(({ label, date, displayDate }) => `<div><span>${esc(label)}</span><span class="milestone-date"><b>${esc(displayDate)}</b><span class="milestone-days" data-milestone-date="${esc(date)}">${milestoneDaysLeft(date)}</span></span></div>`).join('')}</div>` : ''}<div class="mini ${timeline ? 'mini-progress' : ''}"><div><b>${a.length}</b>Total</div><div><b>${rem}</b>Remaining</div></div></article>`;
}

/* =========================================================
   MAIN DASHBOARD RENDERING
   Display the dashboard sections using the loaded board data
========================================================= */
/* =========================================================
   RISK CALCULATIONS
   Calculate progress, open work, and risk totals
========================================================= */
/* =========================================================
   DATA QUALITY CHECKS
   Identify missing ticket details for the data quality section
========================================================= */
function render() { let complete = C.filter(c => DONE.includes(c.status)).length, crit = C.filter(c => c.priority === 'Critical' && !DONE.includes(c.status)).length, mil = ms(), rows = [...mil, 'BAU'], ps = ['Critical', 'High', 'Medium', 'Low', 'Missing'], open = C.filter(c => !DONE.includes(c.status)), mat = rows.map(r => ps.map(p => open.filter(c => (r === 'BAU' ? bau(c) : c.m.includes(r)) && c.priority === p).length)), mx = Math.max(1, ...mat.flat()); document.getElementById('subtitle').textContent = (D.name || 'Trello board') + ' · ' + C.length + ' active tickets'; document.getElementById('updated').textContent = 'Last updated: ' + new Date(D.dateLastActivity || Date.now()).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); let checks = [['Missing Milestone', c => !c.m.length], ['Missing Stream', c => !c.s.length], ['Missing Priority', c => c.priority === 'Missing'], ['Missing Owner', c => !c.owners.length]]; app.innerHTML = `<section class="summary"><div class="box metric"><b>${C.length}</b><span>Active tickets</span></div><div class="box metric"><b>${C.length - complete}</b><span>Remaining</span></div><div class="box metric"><b>${crit}</b><span>Critical open</span></div></section><section class="cards">${mil.map(m => card(m, C.filter(c => c.m.includes(m)))).join('')}${card('BAU Operations', C.filter(bau), true)}</section><section class="box" style="margin-top:18px"><div class="head"><div><h2>What kind of work remains?</h2><p class="muted">Open tickets by Ticket Type · use the filters to focus the work mix.</p></div><span class="pill high">${open.filter(c => types(c).includes('Hypercare')).length} Hypercare open</span></div>${typeChips()}${bars(open.filter(c => !ys.length || types(c).some(t => ys.includes(t))).flatMap(types))}<h3 style="margin-top:22px">Ticket Type by milestone</h3><div class="heat"><table><tr><th></th>${['Hypercare', 'Bug', 'Feature', 'Optimization'].map(t => `<th>${t}</th>`).join('')}</tr>${rows.map(r => `<tr><th>${esc(r)}</th>${['Hypercare', 'Bug', 'Feature', 'Optimization'].map((t, i) => `<td style="background:${['#ff2f92', '#ef3340', '#2457ff', '#c8ff00'][i]};color:${i === 3 ? '#111' : '#fff'}">${open.filter(c => (r === 'BAU' ? bau(c) : c.m.includes(r)) && types(c).includes(t)).length}</td>`).join('')}</tr>`).join('')}</table></div></section><div class="grid"><section class="box"><h2>Where is the work?</h2><p class="muted">Select one or more milestones.</p>${chips('s', ss)}${bars(C.filter(c => match(c, ss)).flatMap(c => c.s.length ? c.s : ['Missing']))}</section><section class="box"><h2>Where is the work in the process?</h2><p class="muted">Status follows Trello list order.</p>${chips('t', ts)}${bars(C.filter(c => match(c, ts)).map(c => c.status), ORDER)}</section></div><section class="box" style="margin-top:16px"><h2>Delivery risk by milestone</h2><p class="muted">Open work only · milestone × priority.</p><div class="heat"><table><tr><th></th>${ps.map(p => `<th>${p}</th>`).join('')}</tr>${rows.map((r, i) => `<tr><th>${r}</th>${ps.map((p, j) => { let n = mat[i][j], a = .12 + .78 * n / mx, col = p === 'Critical' ? `rgba(255,47,146,${a})` : p === 'High' ? `rgba(255,212,0,${a})` : `rgba(36,87,255,${a})`; return `<td style="background:${col}">${n}</td>` }).join('')}</tr>`).join('')}</table></div></section><section class="box" style="margin-top:16px"><h2>Data quality actions</h2><p class="muted">Open affected cards directly in Trello.</p>${checks.map(([n, f]) => { let a = C.filter(f); return `<details class="issue"><summary><span>${n}</span><span class="pill">${a.length}</span></summary>${a.map(c => `<div><a href="${esc(c.url)}" target="_blank">${esc(c.name)}</a><a href="${esc(c.url)}" target="_blank" style="float:right">Open in Trello ↗</a></div>`).join('')}</details>` }).join('')}</section>` }

/* =========================================================
   JSON LOADING
   Fetch the latest board data when the page loads or is refreshed
========================================================= */
const renderDashboard = render;
render = function () {
    renderDashboard();
    updateMilestoneDays();
    updateMissingOwnerActions();

    const updatedAt = fileLastModified && !Number.isNaN(fileLastModified.getTime())
        ? new Intl.DateTimeFormat('en-AU', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZone: 'Australia/Sydney',
            timeZoneName: 'short'
        }).format(fileLastModified)
        : 'timestamp unavailable';
    document.getElementById('updated').textContent = 'Data last updated: ' + updatedAt;

    const sections = [...app.querySelectorAll('section.box')];
    const headingRenames = new Map([
        ['What kind of work remains?', 'Tickets by Type'],
        ['Where is the work?', 'Tickets by Stream'],
        ['Where is the work in the process?', 'Tickets by Status'],
        ['Delivery risk by milestone', 'Priority by Milestone'],
        ['Data quality actions', 'Tickets Missing Details']
    ]);

    sections.forEach(section => {
        const heading = section.querySelector('h2');
        if (heading && headingRenames.has(heading.textContent)) {
            heading.textContent = headingRenames.get(heading.textContent);
        }

        const description = section.querySelector('p.muted');
        if (description && description.textContent === 'Open work only · milestone × priority.') {
            description.textContent = 'Open work only';
        }
        if (description && description.textContent === 'Open affected cards directly in Trello.') {
            description.textContent = 'Funlab to update card details.';
        }
    });

    const ticketSection = sections.find(section => {
        const heading = section.querySelector('h2');
        return heading && heading.textContent === 'Tickets by Type';
    });
    const riskSection = sections.find(section => {
        const heading = section.querySelector('h2');
        return heading && heading.textContent === 'Priority by Milestone';
    });

    riskSection.parentNode.insertBefore(ticketSection, riskSection);
};

async function load() {
    notice.style.display = 'none';
    try {
        let r = await fetch(URL + '?v=' + Date.now(), { cache: 'no-store' });
        if (!r.ok) throw Error(r.status);
        const data = await r.json();
        prep(data, r.headers.get('Last-Modified'));
    } catch (e) {
        /* =========================================================
           ERROR HANDLING
           Show the existing notice when the board cannot be loaded
        ========================================================= */
        notice.textContent = 'The permanent SharePoint JSON endpoint could not be loaded. Confirm you are signed in to SharePoint and have access to current-board.json, then select Refresh data.';
        notice.style.display = 'block';
    }
}

load();
setInterval(updateMilestoneDays, 60 * 1000);
