import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

const GITHUB_REPO = 'https://github.com/exitcy/portfolio';
const fileTypeColors = d3.scaleOrdinal(d3.schemeTableau10);

let xScale;
let yScale;
let commits = [];
let commitProgress = 100;
let timeScale;
let commitMaxTime;
let filteredCommits = [];
let data = [];

async function loadData() {
  const rows = await d3.csv('loc.csv', (row) => ({
    ...row,
    line: Number(row.line),
    depth: Number(row.depth),
    length: Number(row.length),
    date: new Date(row.date + 'T00:00' + row.timezone),
    datetime: new Date(row.datetime),
  }));

  return rows.filter(
    (d) =>
      Number.isFinite(d.line) &&
      Number.isFinite(d.depth) &&
      Number.isFinite(d.length) &&
      !Number.isNaN(d.date.getTime()) &&
      !Number.isNaN(d.datetime.getTime()),
  );
}

function processCommits(data) {
  return d3
    .groups(data, (d) => d.commit)
    .map(([commit, lines]) => {
      const first = lines[0];
      const { author, date, time, timezone, datetime } = first;

      const ret = {
        id: commit,
        url: `${GITHUB_REPO}/commit/${commit}`,
        author,
        date,
        time,
        timezone,
        datetime,
        hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
        totalLines: lines.length,
      };

      Object.defineProperty(ret, 'lines', {
        value: lines,
        enumerable: false,
        configurable: true,
        writable: true,
      });

      return ret;
    });
}

function renderCommitInfo(data, commits) {
  const container = d3.select('#stats');
  container.selectAll('*').remove();

  const dl = container.append('dl').attr('class', 'stats');

  function addStat(label, value) {
    dl.append('dt').text(label);
    dl.append('dd').html(value);
  }

  addStat('Total LOC', data.length);
  addStat('Total commits', commits.length);
  addStat('Total files', d3.group(data, (d) => d.file).size);
  addStat(
    'Average line length',
    d3.mean(data, (d) => d.length)?.toFixed(1) ?? '—',
  );
  addStat('Maximum depth', d3.max(data, (d) => d.depth) ?? '—');

  const workByPeriod = d3.rollups(
    data,
    (v) => v.length,
    (d) => new Date(d.datetime).toLocaleString('en', { dayPeriod: 'short' }),
  );
  const mostActive =
    d3.greatest(workByPeriod, (d) => d[1])?.[0] ?? '—';
  addStat('Most active time of day', mostActive);
}

function renderTooltipContent(commit) {
  if (!commit || !commit.id) return;

  const link = document.getElementById('commit-link');
  const date = document.getElementById('commit-date');
  const time = document.getElementById('tooltip-time');
  const author = document.getElementById('commit-author');
  const lines = document.getElementById('commit-lines');

  link.href = commit.url;
  link.textContent = commit.id;

  date.textContent = commit.datetime?.toLocaleString('en', {
    dateStyle: 'full',
  });
  time.textContent = commit.time;
  author.textContent = commit.author;
  lines.textContent = commit.totalLines;
}

let tooltipHideTimeout;

function updateTooltipVisibility(isVisible) {
  const tooltip = document.getElementById('commit-tooltip');
  if (isVisible) {
    clearTimeout(tooltipHideTimeout);
    tooltip.hidden = false;
  } else {
    clearTimeout(tooltipHideTimeout);
    tooltipHideTimeout = setTimeout(() => {
      tooltip.hidden = true;
    }, 120);
  }
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById('commit-tooltip');
  const offset = 12;
  let left = event.clientX + offset;
  let top = event.clientY + offset;

  tooltip.style.left = '0px';
  tooltip.style.top = '0px';

  const rect = tooltip.getBoundingClientRect();
  const maxLeft = window.innerWidth - rect.width - offset;
  const maxTop = window.innerHeight - rect.height - offset;

  left = Math.max(offset, Math.min(left, maxLeft));
  top = Math.max(offset, Math.min(top, maxTop));

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function setupTooltipInteraction() {
  const tooltip = document.getElementById('commit-tooltip');
  tooltip.addEventListener('mouseenter', () => {
    clearTimeout(tooltipHideTimeout);
    tooltip.hidden = false;
  });
  tooltip.addEventListener('mouseleave', () => {
    updateTooltipVisibility(false);
  });
}

function isCommitSelected(selection, commit) {
  if (!selection) return false;
  const [[x0, y0], [x1, y1]] = selection;
  const x = xScale(commit.datetime);
  const y = yScale(commit.hourFrac);
  return x0 <= x && x <= x1 && y0 <= y && y <= y1;
}

function brushed(event) {
  const selection = event.selection;
  d3.selectAll('circle').classed('selected', (d) =>
    isCommitSelected(selection, d),
  );
  renderSelectionCount(selection);
  renderLanguageBreakdown(selection);
}

function renderSelectionCount(selection) {
  const selectedCommits = selection
    ? filteredCommits.filter((d) => isCommitSelected(selection, d))
    : [];

  const countElement = document.getElementById('selection-count');
  countElement.textContent =
    `${selectedCommits.length || 'No'} commit${selectedCommits.length === 1 ? '' : 's'} selected`;

  return selectedCommits;
}

function renderLanguageBreakdown(selection) {
  const selectedCommits = selection
    ? filteredCommits.filter((d) => isCommitSelected(selection, d))
    : [];
  const container = document.getElementById('language-breakdown');
  container.innerHTML = '';

  if (selectedCommits.length === 0) {
    return;
  }

  const lines = selectedCommits.flatMap((d) => d.lines);
  const breakdown = d3.rollup(
    lines,
    (v) => v.length,
    (d) => d.type,
  );

  for (const [language, count] of breakdown) {
    const proportion = count / lines.length;
    const dt = document.createElement('dt');
    dt.textContent = language;
    const dd = document.createElement('dd');
    dd.textContent = `${count} lines (${d3.format('.1~%')(proportion)})`;
    container.append(dt, dd);
  }
}

function createBrushSelector(svg, usableArea) {
  svg.call(
    d3
      .brush()
      .extent([
        [usableArea.left, usableArea.top],
        [usableArea.right, usableArea.bottom],
      ])
      .on('start brush end', brushed),
  );
  svg.selectAll('.dots, .overlay ~ *').raise();
}

function createRScale(commits) {
  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  return d3
    .scaleSqrt()
    .domain([
      minLines ?? 0,
      maxLines === minLines ? (minLines ?? 0) + 1 : (maxLines ?? 1),
    ])
    .range([2, 30]);
}

function bindCircleInteractions(selection) {
  selection
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mousemove', (event) => {
      updateTooltipPosition(event);
    })
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.7);
      updateTooltipVisibility(false);
    });
}

function renderScatterPlot(data, commits) {
  const width = 1000;
  const height = 600;
  const margin = { top: 10, right: 10, bottom: 40, left: 50 };

  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('overflow', 'visible');

  xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();

  yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([usableArea.bottom, usableArea.top]);

  const rScale = createRScale(commits);

  const gridlines = svg
    .append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left}, 0)`);

  gridlines.call(
    d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width),
  );

  const xAxis = d3
    .axisBottom(xScale)
    .ticks(8)
    .tickFormat(d3.timeFormat('%b %d'));
  const yAxis = d3
    .axisLeft(yScale)
    .tickFormat((d) => String(d).padStart(2, '0') + ':00');

  svg
    .append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0, ${usableArea.bottom})`)
    .call(xAxis);

  svg
    .append('g')
    .attr('class', 'y-axis')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(yAxis);

  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);
  const dots = svg.append('g').attr('class', 'dots');

  const circles = dots
    .selectAll('circle')
    .data(sortedCommits, (d) => d.id)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .attr('fill', 'steelblue')
    .style('fill-opacity', 0.7);

  bindCircleInteractions(circles);
  createBrushSelector(svg, usableArea);
}

function updateScatterPlot(data, commits) {
  const svg = d3.select('#chart').select('svg');
  if (svg.empty()) return;

  const domainSource =
    commits.length > 0
      ? commits
      : [{ datetime: commitMaxTime }];
  xScale.domain(d3.extent(domainSource, (d) => d.datetime)).nice();

  const xAxis = d3
    .axisBottom(xScale)
    .ticks(8)
    .tickFormat(d3.timeFormat('%b %d'));

  svg.select('g.x-axis').call(xAxis);

  const rScale = createRScale(
    commits.length > 0 ? commits : [{ totalLines: 1 }],
  );
  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

  const circles = svg
    .select('g.dots')
    .selectAll('circle')
    .data(sortedCommits, (d) => d.id)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .attr('fill', 'steelblue')
    .style('fill-opacity', 0.7);

  bindCircleInteractions(circles);
  svg.selectAll('.dots, .overlay ~ *').raise();
}

function updateFileDisplay(filteredCommits) {
  const lines = filteredCommits.flatMap((d) => d.lines);
  let files = d3
    .groups(lines, (d) => d.file)
    .map(([name, lines]) => ({ name, lines }))
    .sort((a, b) => b.lines.length - a.lines.length);

  const filesContainer = d3
    .select('#files')
    .selectAll('div')
    .data(files, (d) => d.name)
    .join(
      (enter) =>
        enter.append('div').call((div) => {
          div.append('dt').append('code');
          div.append('dd');
        }),
      (update) => update,
      (exit) => exit.remove(),
    );

  filesContainer
    .select('dt')
    .html(
      (d) =>
        `<code>${d.name}</code><br><small>${d.lines.length} lines</small>`,
    );

  filesContainer
    .select('dd')
    .selectAll('div.loc')
    .data((d) => d.lines)
    .join('div')
    .attr('class', 'loc')
    .attr('style', (d) => `--color: ${fileTypeColors(d.type)}`);
}

function applyCommitFilter() {
  filteredCommits = commits.filter((d) => d.datetime <= commitMaxTime);
  const filteredData = filteredCommits.flatMap((d) => d.lines);
  updateScatterPlot(data, filteredCommits);
  renderCommitInfo(filteredData, filteredCommits);
  updateFileDisplay(filteredCommits);
}

function onTimeSliderChange() {
  commitProgress = Number(document.getElementById('commit-progress').value);
  commitMaxTime = timeScale.invert(commitProgress);

  document.getElementById('commit-time').textContent =
    commitMaxTime.toLocaleString('en', {
      dateStyle: 'long',
      timeStyle: 'short',
    });

  applyCommitFilter();
}

function renderScatterStory() {
  const sorted = d3.sort(commits, (d) => d.datetime);

  d3.select('#scatter-story')
    .selectAll('.step')
    .data(sorted)
    .join('div')
    .attr('class', 'step')
    .html(
      (d) => {
        const fileCount = d3.group(d.lines, (line) => line.file).size;
        const when = d.datetime.toLocaleString('en', {
          dateStyle: 'long',
          timeStyle: 'short',
        });
        const lineWord = d.totalLines === 1 ? 'line' : 'lines';
        const fileWord = fileCount === 1 ? 'file' : 'files';
        return `
          <p>
            On ${when}, I made
            <a href="${d.url}" target="_blank" rel="noopener noreferrer">a commit</a>
            that edited ${d.totalLines} ${lineWord} across ${fileCount} ${fileWord}.
          </p>
        `;
      },
    );
}

function onStepEnter(response) {
  commitMaxTime = response.element.__data__.datetime;
  commitProgress = timeScale(commitMaxTime);

  const slider = document.getElementById('commit-progress');
  slider.value = commitProgress;

  document.getElementById('commit-time').textContent =
    commitMaxTime.toLocaleString('en', {
      dateStyle: 'long',
      timeStyle: 'short',
    });

  applyCommitFilter();
}

setupTooltipInteraction();

data = await loadData();
commits = processCommits(data);
filteredCommits = commits;

timeScale = d3
  .scaleTime()
  .domain(d3.extent(commits, (d) => d.datetime))
  .range([0, 100]);
commitMaxTime = timeScale.invert(commitProgress);

renderCommitInfo(data, commits);
renderScatterPlot(data, commits);
updateFileDisplay(filteredCommits);
renderScatterStory();

document
  .getElementById('commit-progress')
  .addEventListener('input', onTimeSliderChange);
onTimeSliderChange();

const scroller = scrollama();
scroller
  .setup({
    container: '#scrolly-1',
    step: '#scrolly-1 .step',
  })
  .onStepEnter(onStepEnter);
