// Every scene, shared by the home page's gliding rows and the Scenes page's grid, and the enlarged view both open.
// In dark mode every scene is shown at night.
const IMG = "img/";
const CHECKOUT = { // scene id → Polar checkout link
  amber: "https://buy.polar.sh/polar_cl_4bxbAaAXsxQIUtGZbxvpihHPf8Tx0kdJ3rhip21wtue",
  blossom: "https://buy.polar.sh/polar_cl_X9YNV8jDPD0aDZSGpDffukmL8lnqdOMVGGb0O3GPzv2",
  cinder: "https://buy.polar.sh/polar_cl_WRuX9arBlFzec3n6aDtq3iow7qc0uqIllonFg2Eg3RB",
  claycourt: "https://buy.polar.sh/polar_cl_guH7deGJ5nQbgme70EFkAg8TksIwmHX6eee9v2fQ3VG",
  dunes: "https://buy.polar.sh/polar_cl_AQMtkJx1AmiV7sMcrnqPxChiCbEnQ6TZ2JUSl3VLsjG",
  forest: "https://buy.polar.sh/polar_cl_AiBygulVdqVBxDEj3Y9dVw7IbGzm3peOwxuk43l1CXi",
  frost: "https://buy.polar.sh/polar_cl_41rHDqINLsf20AVK04IcpTjVwL0S9lKqWYbqf3e1EKv",
  hardcourt: "https://buy.polar.sh/polar_cl_LiOSQM4n5hCFYCQa0zodQpUhJEowPBA7aOgNF0WVaTG",
  lumen: "https://buy.polar.sh/polar_cl_HFIWxE0cmL7GQUuUZUVTvrTN9RnGStGJaDmyz2A2U0j",
  map: "https://buy.polar.sh/polar_cl_QMp4eG8VXJfqA1UUkwyydMj42F0tnJmN9JDLF0bafPl",
  pinewood: "https://buy.polar.sh/polar_cl_MpR74xXJKsWkoU1ozgOkQNqPHaQVzTPCtTE3C1P1D3z",
  slopes: "https://buy.polar.sh/polar_cl_wXDY4e9YJ05W84mJLc9toiXsNVHhKORqaZwSM1d9S9i",
  topo: "https://buy.polar.sh/polar_cl_aZP8GMm0tS0w3m4YpfrxmqMxeMneTwWGPEX5v1kjh55"
};

const SCENES = [
  ["lagoon", "Lagoon", "Sandy beaches on a turquoise sea", true],
  ["meadow", "Cloud Meadow", "Clouds drifting over a sunny field", true],
  ["metro", "Metro", "Skyscraper rooftops above the city", true],
  ["blossom", "Blossom Pond", "Cherry-blossom canopies over a koi pond", false],
  ["amber", "Amberwood", "Autumn treetops over a golden field", false],
  ["forest", "Forest", "Sunny clearings in a deep, many-treed wood", false],
  ["slopes", "Slopes", "Skiers and lit alpine villages on a white run", false],
  ["lumen", "Lumen Grove", "Glowing moss islands on midnight water", false],
  ["pinewood", "Pinewood Lake", "Pine-ringed islands on a quiet lake", false],
  ["claycourt", "Clay Court", "Tennis on sun-baked clay", false],
  ["hardcourt", "Hardcourt", "Blue basketball courts and packed bleachers", false],
  ["dunes", "Dunes", "Sandstone mesas in a rippled desert", false],
  ["frost", "Frostland", "Ice floes below a snowy village", false],
  ["cinder", "Cinder", "Basalt plateaus in a sea of lava", false],
  ["topo", "Topograph", "Your icons as hilltops on a contour map", false],
  ["map", "Map", "An old inked map of your own home region", false]
];

const darkMode = matchMedia("(prefers-color-scheme: dark)");
const stillMotion = matchMedia("(prefers-reduced-motion: reduce)");
const MEDIA = "?v=2";   // bump when the stills and loops are re-rendered, so browsers don't keep the old ones
const thumbSrc = id => `${IMG}thumbs/${id}${darkMode.matches ? "-night" : ""}.jpg${MEDIA}`;
const fullSrc = id => `${IMG}${id}${darkMode.matches ? "-night" : ""}.jpg${MEDIA}`;
const loopSrc = (id, hd) => `${IMG}loops${hd ? "-hd" : ""}/${id}${darkMode.matches ? "-night" : ""}.mp4${MEDIA}`;

// The enlarged view: the scene's sharp loop with its name rising in underneath.
const lb = document.getElementById("lightbox"), lbImg = lb.querySelector("img"), lbVid = lb.querySelector("video"), lbCap = lb.querySelector("figcaption");
let cur = 0, lastFocus = null;
function openLB(i) {
  cur = (i + SCENES.length) % SCENES.length;
  const [id, name, blurb, free] = SCENES[cur];
  lb.classList.remove("show");
  lbImg.src = fullSrc(id); lbImg.alt = `${name} scene`;
  if (!stillMotion.matches) { lbVid.src = loopSrc(id, true); lbVid.play().catch(() => {}); }
  const buy = CHECKOUT[id];
  lbCap.querySelector("b").textContent = name;
  lbCap.querySelector("span").innerHTML = `${blurb} · ${free ? "Free" : (buy ? `<a href="${buy}">Buy for $2</a>` : "$2")}`;
  if (lb.hidden) { lastFocus = document.activeElement; lb.hidden = false; lb.querySelector(".lb-close").focus(); }
  requestAnimationFrame(() => requestAnimationFrame(() => lb.classList.add("show")));
}
function closeLB() { lb.hidden = true; lb.classList.remove("show"); lbVid.pause(); lbVid.removeAttribute("src"); lastFocus && lastFocus.focus(); }
lb.querySelector(".lb-close").onclick = closeLB;
lb.querySelector(".lb-prev").onclick = () => openLB(cur - 1);
lb.querySelector(".lb-next").onclick = () => openLB(cur + 1);
lb.addEventListener("click", e => { if (e.target === lb) closeLB(); });
document.addEventListener("keydown", e => {
  if (lb.hidden) return;
  if (e.key === "Escape") closeLB();
  if (e.key === "ArrowLeft") openLB(cur - 1);
  if (e.key === "ArrowRight") openLB(cur + 1);
});
