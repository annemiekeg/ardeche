
const STORE = {
  favs: "ard-map:favs",
  done: "ard-map:done",
  notes: "ard-map:notes",
  plan: "ard-map:plan"
};

const state = {
  tab: "list",
  favs: new Set(JSON.parse(localStorage.getItem(STORE.favs) || "[]")),
  done: new Set(JSON.parse(localStorage.getItem(STORE.done) || "[]")),
  notes: JSON.parse(localStorage.getItem(STORE.notes) || "{}"),
  plan: JSON.parse(localStorage.getItem(STORE.plan) || "{}"),
  filters: { q:"", age:"all", category:"", region:"", drive:"999", special:"" }
};

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));

let map, layerGroup, circlesGroup;

function save(){
  localStorage.setItem(STORE.favs, JSON.stringify([...state.favs]));
  localStorage.setItem(STORE.done, JSON.stringify([...state.done]));
  localStorage.setItem(STORE.notes, JSON.stringify(state.notes));
  localStorage.setItem(STORE.plan, JSON.stringify(state.plan));
  updateStats();
}

function categoryInfo(cat, types=[]){
  const text = types.join(" ").toLowerCase();
  if(text.includes("trail") || text.includes("hardlopen")) return {key:"sport", emoji:"👟", label:"Hardlopen", color:"#7b4fab", bg:"linear-gradient(135deg,#445d48,#d5a253)"};
  if(text.includes("mtb")) return {key:"bike", emoji:"🚵", label:"Mountainbike", color:"#78a641", bg:"linear-gradient(135deg,#3d5a2a,#92c46b)"};
  if(cat==="water") return {key:"water", emoji:"🌊", label:"Water & rivier", color:"#0f82a8", bg:"linear-gradient(135deg,#0f82a8,#7bd3d6)"};
  if(text.includes("via ferrata")) return {key:"adventure", emoji:"🧗", label:"Via ferrata", color:"#c46b2c", bg:"linear-gradient(135deg,#6d4c41,#d69c63)"};
  if(text.includes("canyon")) return {key:"adventure", emoji:"🪢", label:"Canyoning", color:"#c46b2c", bg:"linear-gradient(135deg,#2f5f8a,#7ac8e8)"};
  if(cat==="adventure") return {key:"adventure", emoji:"🌲", label:"Avontuur", color:"#c46b2c", bg:"linear-gradient(135deg,#3b6b3d,#9fd08b)"};
  if(cat==="indoor") return {key:"indoor", emoji:"🦇", label:"Binnen & grotten", color:"#59616f", bg:"linear-gradient(135deg,#292f36,#7b8794)"};
  if(cat==="culture") return {key:"culture", emoji:"🏘️", label:"Dorpjes & cultuur", color:"#b84d3b", bg:"linear-gradient(135deg,#b44b31,#f0bf76)"};
  if(cat==="bike") return {key:"bike", emoji:"🚲", label:"Fietsen", color:"#78a641", bg:"linear-gradient(135deg,#18736f,#95c96f)"};
  return {key:"walk", emoji:"🥾", label:"Wandelen & uitzicht", color:"#2f7d55", bg:"linear-gradient(135deg,#2f6b4f,#d7b56d)"};
}

function ageLabel(a){
  if(a.age <= 6) return "Kato+";
  if(a.age <= 8) return "Tibbe/Rover+";
  if(a.age <= 12) return "Jens+";
  if(a.age <= 14) return "Lize+";
  return "Volwassen";
}
function stars(n){ return "★".repeat(n)+"☆".repeat(5-n); }
function score(a){
  let s=3; if(a.top)s+=1.2; if(a.drive<=15)s+=.35; if(a.heat)s+=.2; if(a.age<=6)s+=.25; if((a.type||[]).includes("Iconisch"))s+=.45; if(a.difficulty>=4)s-=.25;
  return Math.max(1, Math.min(5, Math.round(s)));
}

function matches(a){
  const f = state.filters;
  const q = f.q.toLowerCase().trim();
  if(q && !(`${a.title} ${a.desc} ${a.type.join(" ")} ${a.distance} ${a.duration} ${a.height} ${a.region}`.toLowerCase().includes(q))) return false;
  if(f.age !== "all" && f.age !== "adult" && a.age > Number(f.age)) return false;
  if(f.age === "adult" && !(a.age >= 14 || a.difficulty >= 4 || a.type.includes("Volwassenen"))) return false;
  if(f.category && a.mainCat !== f.category) return false;
  if(f.region && a.region !== f.region) return false;
  if(a.drive > Number(f.drive)) return false;
  if(f.special === "hot" && !(a.heat && (a.mainCat==="water" || a.mainCat==="indoor" || a.mainCat==="bike" || a.drive<=10))) return false;
  if(f.special === "rain" && !a.rain) return false;
  if(f.special === "free" && !String(a.cost).toLowerCase().includes("gratis")) return false;
  if(f.special === "fav" && !state.favs.has(a.id)) return false;
  if(f.special === "todo" && state.done.has(a.id)) return false;
  return true;
}

function visibleActivities(){
  let arr = ACTIVITIES.filter(matches);
  if(state.tab === "top") arr = arr.filter(a => a.top);
  return arr.sort((a,b) => {
    const ad = state.done.has(a.id), bd = state.done.has(b.id);
    if(state.tab === "list" && ad !== bd) return ad ? 1 : -1;
    return (b.top-a.top) || (a.drive-b.drive) || a.title.localeCompare(b.title);
  });
}

function visualDiv(a, cls="visual"){
  const v = categoryInfo(a.mainCat, a.type);
  return `<div class="${cls}" data-emoji="${v.emoji}" data-label="${v.label}" style="--bgv:${v.bg}"></div>`;
}

function card(a){
  const done = state.done.has(a.id), fav = state.favs.has(a.id);
  const v = categoryInfo(a.mainCat, a.type);
  return `<article class="card ${done ? "done" : ""}">
    <div class="visual" data-emoji="${v.emoji}" data-label="${v.label}" style="--bgv:${v.bg}">
      <div class="badges">
        <span class="badge">🚗 ${a.drive} min</span>
        <span class="badge">👧 ${ageLabel(a)}</span>
        <span class="badge">📍 ${esc(a.region)}</span>
        ${a.top ? '<span class="badge top">Top 20</span>' : ''}
        ${fav ? '<span class="badge favb">Favoriet</span>' : ''}
        ${done ? '<span class="badge doneb">Gedaan</span>' : ''}
      </div>
    </div>
    <div class="content">
      <div class="title">${esc(a.title)}</div>
      <div class="meta"><span class="pill">${esc(a.duration)}</span><span class="pill">${esc(a.distance)}</span><span class="pill">💪 ${stars(a.difficulty)}</span></div>
      <div class="desc">${esc(a.desc)}</div>
      <div class="actions">
        <button class="${fav ? "on" : ""}" onclick="toggleFav('${a.id}')">⭐</button>
        <button class="${done ? "doneOn" : ""}" onclick="toggleDone('${a.id}')">✅</button>
        <button onclick="openDetail('${a.id}')">Details</button>
        <a href="${a.maps}" target="_blank">Maps</a>
      </div>
    </div>
  </article>`;
}

function updateStats(){
  const visible = visibleActivities().length;
  $("statTotal").textContent = ACTIVITIES.length;
  $("statVisible").textContent = visible;
  $("statFav").textContent = state.favs.size;
  $("statDone").textContent = state.done.size;
}

function renderCards(target, arr){
  target.innerHTML = arr.length ? arr.map(card).join("") : `<div class="card"><div class="content"><b>Geen resultaten</b><p class="desc">Zet een filter uit of klik Reset.</p></div></div>`;
}

function renderList(){
  renderCards($("cards"), visibleActivities());
}

function renderTop(){
  renderCards($("topCards"), visibleActivities().filter(a => a.top));
}

function renderRegions(){
  const arr = visibleActivities();
  const groups = {};
  for(const a of arr) (groups[a.region] ||= []).push(a);
  $("regionsList").innerHTML = Object.entries(groups).sort().map(([region, items]) => {
    const sample = items.slice(0,8).map(a => `<li><a href="#" onclick="openDetail('${a.id}');return false">${esc(a.title)}</a> <span class="small">(${a.drive} min)</span></li>`).join("");
    const mapsQuery = encodeURIComponent(region + " Ardèche");
    return `<section class="regionBox"><h2>${esc(region)}</h2><p class="small">${items.length} activiteiten in deze regio. Handig om op één dag te combineren.</p><ul>${sample}</ul><p><a target="_blank" href="https://www.google.com/maps/search/${mapsQuery}">Bekijk regio in Google Maps</a></p></section>`;
  }).join("");
}

function renderNearby(arr){
  const near = arr.slice().sort((a,b)=>a.drive-b.drive).slice(0,10);
  $("nearbyList").innerHTML = `<div class="mapLinks"><a target="_blank" href="https://www.google.com/maps/search/activities+near+Camping+du+Pont+Pradons+Ardeche">Open in Google Maps</a><a target="_blank" href="https://www.google.com/maps/dir/Camping+du+Pont+Pradons+Ardeche/Pont+d%27Arc+Ardeche">Route Pont d\'Arc</a></div><h3>Dichtbij / logisch eerst</h3>` + near.map(a => `<div class="nearItem" onclick="openDetail('${a.id}')"><b>${esc(a.title)}</b><span>🚗 ${a.drive} min · ${esc(a.region)} · ${ageLabel(a)}</span></div>`).join("");
}

function initMap(){
  const mapEl = document.getElementById("map");
  if (mapEl) mapEl.innerHTML = "";
  map = L.map("map", { scrollWheelZoom:true }).setView([CAMPING.lat, CAMPING.lon], 10);
  const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  tiles.on("tileerror", () => {
    const el = document.querySelector(".leaflet-container");
    if (el && !document.getElementById("tileWarning")) {
      const warn = document.createElement("div");
      warn.id = "tileWarning";
      warn.className = "tileWarning";
      warn.textContent = "Kaarttegels laden traag of worden geblokkeerd. De markers werken mogelijk wel; gebruik anders de Google Maps-knoppen.";
      el.appendChild(warn);
    }
  });
  layerGroup = L.layerGroup().addTo(map);
  circlesGroup = L.layerGroup().addTo(map);

  const campingIcon = L.divIcon({ className:"", html:`<div class="markerIcon camping">⛺</div>`, iconSize:[34,34], iconAnchor:[17,17]});
  L.marker([CAMPING.lat, CAMPING.lon], {icon:campingIcon}).addTo(map).bindPopup(`<b>${esc(CAMPING.name)}</b><br>Startpunt van de planner`);

  // Rough radius circles: visual distance rings, not exact road time
  [
    {r:7000, label:"±10 min", color:"#176f6b"},
    {r:15000, label:"±20 min", color:"#8aa641"},
    {r:25000, label:"±30 min", color:"#d69b31"},
    {r:40000, label:"±45 min", color:"#e56f3d"}
  ].forEach(c => L.circle([CAMPING.lat, CAMPING.lon], {radius:c.r, color:c.color, weight:1, fill:false, opacity:.55}).addTo(circlesGroup));
}

function markerIcon(a){
  const info = categoryInfo(a.mainCat, a.type);
  return L.divIcon({
    className:"",
    html:`<div class="markerIcon" style="background:${info.color}">${info.emoji}</div>`,
    iconSize:[30,30],
    iconAnchor:[15,15],
    popupAnchor:[0,-14]
  });
}

function renderMap(){
  if(!map) initMap();
  layerGroup.clearLayers();
  const arr = visibleActivities();
  const bounds = [[CAMPING.lat, CAMPING.lon]];
  for(const a of arr){
    const m = L.marker([a.lat, a.lon], { icon: markerIcon(a) }).addTo(layerGroup);
    m.bindPopup(`<div class="popupTitle">${esc(a.title)}</div>
      <div>🚗 ${a.drive} min · ${ageLabel(a)}<br>${esc(a.region)}</div>
      <div class="popupActions"><button onclick="openDetail('${a.id}')">Details</button><button onclick="toggleFav('${a.id}')">⭐</button><button onclick="toggleDone('${a.id}')">✅</button></div>`);
    bounds.push([a.lat, a.lon]);
  }
  renderNearby(arr);
  setTimeout(() => {
    map.invalidateSize(true);
    if(bounds.length > 1) map.fitBounds(bounds, {padding:[35,35], maxZoom:11});
  }, 150);
}

function renderPlanner(){
  $("planActivity").innerHTML = ACTIVITIES.slice().sort((a,b)=>a.title.localeCompare(b.title)).map(a => `<option value="${a.id}">${esc(a.title)}</option>`).join("");
  $("planDay").innerHTML = Array.from({length:17},(_,i)=>`<option value="${i+1}">Dag ${i+1}</option>`).join("");
  $("planner").innerHTML = Array.from({length:17},(_,i) => {
    const d = i+1;
    const items = (state.plan[d] || []).map(id => ACTIVITIES.find(a => a.id === id)).filter(Boolean).map(a => `<div class="planItem"><button onclick="removePlan(${d},'${a.id}')">×</button><b>${esc(a.title)}</b><br><span class="small">🚗 ${a.drive} min · ${ageLabel(a)}</span></div>`).join("");
    return `<section class="day"><h3>Dag ${d}</h3>${items || '<p class="small">Nog leeg</p>'}</section>`;
  }).join("");
}

function render(){
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === state.tab));
  const viewId = state.tab + "View";
  $(viewId).classList.add("active");
  if(state.tab === "map") renderMap();
  if(state.tab === "list") renderList();
  if(state.tab === "regions") renderRegions();
  if(state.tab === "top") renderTop();
  if(state.tab === "planner") renderPlanner();
  updateStats();
}

function toggleFav(id){
  state.favs.has(id) ? state.favs.delete(id) : state.favs.add(id);
  save(); render();
}
function toggleDone(id){
  state.done.has(id) ? state.done.delete(id) : state.done.add(id);
  save(); render();
}
function addPlan(){
  const d = $("planDay").value, id = $("planActivity").value;
  state.plan[d] ||= [];
  if(!state.plan[d].includes(id)) state.plan[d].push(id);
  save(); renderPlanner(); updateStats();
}
function removePlan(day,id){
  state.plan[day] = (state.plan[day] || []).filter(x => x !== id);
  save(); renderPlanner(); updateStats();
}

function openDetail(id){
  const a = ACTIVITIES.find(x => x.id === id);
  const v = categoryInfo(a.mainCat, a.type);
  const fav = state.favs.has(id), done = state.done.has(id);
  const combos = (a.combine || []).filter(x => x !== a.title).map(t => `<li>${esc(t)}</li>`).join("");
  $("detailContent").innerHTML = `
    <div class="modalVisual" data-emoji="${v.emoji}" data-label="${v.label}" style="--bgv:${v.bg}"></div>
    <div class="modalBody">
      <button class="close" onclick="$('detailDialog').close()">Sluit</button>
      <h2>${esc(a.title)}</h2>
      <p>${esc(a.desc)}</p>
      <div class="detailGrid">
        <div class="detail"><b>Voor wie?</b><br>${ageLabel(a)}<br><span class="small">${esc(a.height || "geen specifieke lengte-eis bekend")}</span></div>
        <div class="detail"><b>Waar?</b><br>${esc(a.region)}<br><span class="small">± ${a.drive} min vanaf camping</span></div>
        <div class="detail"><b>Duur / route</b><br>${esc(a.duration)}<br><span class="small">${esc(a.distance)}</span></div>
        <div class="detail"><b>Moeilijkheid</b><br>${stars(a.difficulty)}<br><span class="small">Vakantiegevoel: ${stars(score(a))}</span></div>
      </div>
      ${combos ? `<h3>Goed te combineren met</h3><ul>${combos}</ul>` : ""}
      <p><a target="_blank" href="${a.maps}">Open in Google Maps</a> · <a target="_blank" href="${a.link}">Website/Google</a> · <a target="_blank" href="https://www.google.com/search?tbm=isch&q=${encodeURIComponent(a.title + ' Ardèche')}">Foto’s bekijken</a></p>
      <div class="actions">
        <button class="${fav ? "on" : ""}" onclick="toggleFav('${id}');openDetail('${id}')">⭐ Favoriet</button>
        <button class="${done ? "doneOn" : ""}" onclick="toggleDone('${id}');openDetail('${id}')">✅ Gedaan</button>
      </div>
      <h3>Notitie</h3>
      <textarea class="notes" id="noteText" placeholder="Bijv. waterschoenen, parkeren, leuk restaurant…">${esc(state.notes[id] || "")}</textarea>
      <p><button onclick="state.notes['${id}']=$('noteText').value; save()">Notitie opslaan</button></p>
      <p class="small">Controleer bij betaalde outdooractiviteiten altijd actuele eisen, weersverwachting, waterstand en beschikbaarheid.</p>
    </div>`;
  $("detailDialog").showModal();
}

function populateRegions(){
  const regions = [...new Set(ACTIVITIES.map(a => a.region))].sort();
  $("region").innerHTML += regions.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join("");
}

document.querySelectorAll(".tabs button").forEach(btn => btn.addEventListener("click", () => {
  state.tab = btn.dataset.tab;
  render();
}));

["search","age","category","region","drive","special"].forEach(id => {
  $(id).addEventListener("input", e => {
    const key = id === "search" ? "q" : id;
    state.filters[key] = e.target.value;
    render();
  });
});

$("reset").addEventListener("click", () => {
  state.filters = { q:"", age:"all", category:"", region:"", drive:"999", special:"" };
  $("search").value = ""; $("age").value = "all"; $("category").value = ""; $("region").value = ""; $("drive").value = "999"; $("special").value = "";
  render();
});
$("addPlan").addEventListener("click", addPlan);

populateRegions();
render();
