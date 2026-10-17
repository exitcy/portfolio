console.log("IT'S ALIVE!");

function $$(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}

const BASE_PATH =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "/"
    : "/portfolio/";

let pages = [
  { url: "", title: "Home" },
  { url: "projects/", title: "Projects" },
  { url: "cv/", title: "CV" },
  { url: "contact/", title: "Contact" },
  { url: "https://github.com/exitcy", title: "GitHub" },
];

let nav = document.createElement("nav");
document.body.prepend(nav);

for (let p of pages) {
  let url = !p.url.startsWith("http") ? BASE_PATH + p.url : p.url;
  let a = document.createElement("a");
  a.href = url;
  a.textContent = p.title;

  if (
    a.host === location.host &&
    a.pathname.replace(/\/$/, "") === location.pathname.replace(/\/$/, "")
  ) {
    a.classList.add("current");
  }

  if (a.host !== location.host) {
    a.target = "_blank";
  }

  nav.append(a);
}

document.body.insertAdjacentHTML(
  "afterbegin",
  `
	<label class="color-scheme">
		Theme:
		<select>
			<option value="light dark">Automatic</option>
			<option value="light">Light</option>
			<option value="dark">Dark</option>
		</select>
	</label>`,
);

const select = document.querySelector(".color-scheme select");

function setColorScheme(colorScheme) {
  document.documentElement.style.colorScheme = colorScheme;
  select.value = colorScheme;
}

if ("colorScheme" in localStorage) {
  setColorScheme(localStorage.colorScheme);
}

select.addEventListener("input", function (event) {
  console.log("color scheme changed to", event.target.value);
  setColorScheme(event.target.value);
  localStorage.colorScheme = event.target.value;
});
