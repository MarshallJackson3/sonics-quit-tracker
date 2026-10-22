// Browser tests for the Sonics app. Run: cd tests && npm test
const { chromium } = require("playwright");
const path = require("path");

const URL = "file://" + path.resolve(__dirname, "../app/index.html");
let failures = 0;
function check(name, ok, detail = "") {
  console.log((ok ? "PASS " : "FAIL ") + name + (detail ? "  (" + detail + ")" : ""));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(URL);

  // Start on a fixed day so the test doesn't depend on the real date.
  const setDay = n => page.evaluate(n => { window.__fast = true; window.__fakeNow = () => new Date(2026, 9, 21 + n); }, n);
  await setDay(0);
  await page.click("#startBtn");
  check("starts at 0-0", (await page.textContent("#hdrRec")) === "0–0");
  check("18-man day-one roster", await page.evaluate(() => window.__sonics.state.roster.length) === 18);
  check("schedule has 82 games", await page.evaluate(() => window.__sonics.state.schedule.length) === 82);
  const rating = await page.evaluate(() => window.__sonics.teamRating(window.__sonics.state.roster));
  check("day-one team is very bad", rating < -10, "rating " + rating.toFixed(1));

  await page.click("#cleanBtn");
  await page.waitForSelector(".final");
  const s1 = await page.evaluate(() => window.__sonics.state);
  check("check-in plays game 1", s1.log.length === 1 && s1.log[0].game.no === 1);
  check("can't check in twice in one day", (await page.$("#cleanBtn")) === null);
  check("streak is 1", (await page.textContent(".stats b")) === "1");

  // A slip: the Sonics lose, the streak resets, the team stays.
  await setDay(1);
  await page.evaluate(() => window.__sonics.render());
  page.once("dialog", d => d.accept());
  await page.click("#slipBtn");
  await page.waitForSelector(".final");
  const s2 = await page.evaluate(() => window.__sonics.state);
  check("slip day is a loss", s2.log[1].game.result === "L" && s2.log[1].game.slip);
  check("slip resets streak", (await page.textContent(".stats b")) === "0");
  check("slip keeps roster", s2.roster.length === 18);

  // Play out the rest of the season.
  for (let d = 2; d < 84; d++) {
    await setDay(d);
    await page.evaluate(() => window.__sonics.checkIn(true));
  }
  const s3 = await page.evaluate(() => window.__sonics.state);
  check("season 1 ends after 82 games", s3.seasons.length === 1 && s3.seasons[0].w + s3.seasons[0].l === 82,
    JSON.stringify(s3.seasons[0]));
  check("season 1 is a bad season", s3.seasons[0].w <= 25, s3.seasons[0].w + " wins");
  check("season 2 begins", s3.season === 2);
  check("streak counts consecutive clean days", await page.evaluate(() => {
    window.__sonics.render(); return document.querySelector(".stats b").textContent;
  }) === "82");

  // Every tab renders, with no sideways scrolling on a phone.
  for (const t of ["games", "roster", "news", "more", "today"]) {
    await page.click(`nav button[data-tab=${t}]`);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(`${t} tab fits phone width`, !wide);
  }

  // Backup and restore.
  const code = await page.evaluate(() => JSON.stringify(window.__sonics.state));
  await page.evaluate(() => { window.__sonics.reset(); });
  await page.reload();
  await page.click("#startBtn");
  await page.click("nav button[data-tab=more]");
  await page.fill("#importText", code);
  page.once("dialog", d => d.accept());
  await page.click("#importBtn");
  check("restore brings back progress", await page.evaluate(() => window.__sonics.state.log.length) === 84);

  check("no page errors", errors.length === 0, errors.join("; "));
  await page.screenshot({ path: path.join(__dirname, "screenshot.png") });
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
})();
