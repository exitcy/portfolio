import { fetchJSON, renderProjects } from "../global.js";
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

const projects = await fetchJSON("../lib/projects.json");
const projectsContainer = document.querySelector(".projects");
const searchInput = document.querySelector(".searchBar");

const titleElement = document.querySelector(".projects-title");
if (titleElement && Array.isArray(projects)) {
  titleElement.textContent = `Projects (${projects.length})`;
}

let query = "";
let selectedYear = null;

const colors = d3.scaleOrdinal(d3.schemeTableau10);
const arcGenerator = d3.arc().innerRadius(0).outerRadius(50);

function setYearFilter(year) {
  selectedYear = selectedYear === year ? null : year;
  updateDisplay();
}

function handleYearKeydown(event, year) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    setYearFilter(year);
  }
}

function renderPieChart(projectsGiven) {
  const svg = d3.select("#projects-pie-plot");
  const legend = d3.select(".legend");

  svg.selectAll("path").remove();
  legend.selectAll("li").remove();

  const given = Array.isArray(projectsGiven) ? projectsGiven : [];
  const rolledData = d3.rollups(
    given,
    (v) => v.length,
    (d) => d.year,
  );
  const data = rolledData.map(([year, count]) => {
    return { value: count, label: year };
  });

  if (data.length === 0) {
    return;
  }

  const sliceGenerator = d3.pie().value((d) => d.value);
  const arcData = sliceGenerator(data);
  const arcs = arcData.map((d) => arcGenerator(d));

  arcs.forEach((arc, i) => {
    const year = data[i].label;
    svg
      .append("path")
      .attr("d", arc)
      .attr("fill", colors(i))
      .attr("class", selectedYear === year ? "selected" : null)
      .attr("role", "button")
      .attr("tabindex", "0")
      .attr("aria-label", `Filter projects from ${year}`)
      .attr("aria-pressed", selectedYear === year ? "true" : "false")
      .on("click", () => setYearFilter(year))
      .on("keydown", (event) => handleYearKeydown(event, year));
  });

  data.forEach((d, idx) => {
    legend
      .append("li")
      .attr("style", `--color:${colors(idx)}`)
      .attr(
        "class",
        selectedYear === d.label ? "legend-item selected" : "legend-item",
      )
      .attr("role", "button")
      .attr("tabindex", "0")
      .attr("aria-label", `Filter projects from ${d.label}`)
      .attr("aria-pressed", selectedYear === d.label ? "true" : "false")
      .html(`<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`)
      .on("click", () => setYearFilter(d.label))
      .on("keydown", (event) => handleYearKeydown(event, d.label));
  });
}

function updateDisplay() {
  if (!Array.isArray(projects)) {
    renderProjects([], projectsContainer, "h2");
    renderPieChart([]);
    return;
  }

  const searched = projects.filter((project) => {
    const values = Object.values(project).join("\n").toLowerCase();
    return values.includes(query.toLowerCase());
  });

  const displayed =
    selectedYear === null
      ? searched
      : searched.filter(
          (project) => String(project.year) === String(selectedYear),
        );

  renderProjects(displayed, projectsContainer, "h2");
  renderPieChart(searched);
}

if (searchInput) {
  searchInput.addEventListener("input", (event) => {
    query = event.target.value;
    updateDisplay();
  });
}

updateDisplay();
