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
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(URL);

  // Fake the clock: day n after Oct 21, 2026, at the given hour.
  const setDay = (n, hour = 21) => page.evaluate(([n, hour]) => {
    window.__fast = true; window.__fakeNow = () => new Date(2026, 9, 21 + n, hour, 0);
  }, [n, hour]);
  const S = () => page.evaluate(() => window.__sonics.state);
  const fresh = async () => { await page.evaluate(() => { window.__sonics.reset(); }); await page.reload(); };

  // Sign up: story, main battle, goals, details.
  async function signUp({ name = "Marshall", main = null, goals = [], quit = "2026-10-21" } = {}) {
    await page.evaluate(() => window.__sonics.render());
    await page.fill("#wName", name);
    await page.click("#wNext");
    if (main) await page.click(`[data-main=${main}]`);
    await page.click("#wNext");
    for (const g of goals) await page.click(`[data-goal=${g}]`);
    await page.click("#wNext");
    await page.fill("#wQuit", quit);
    await page.click("#wDone");
  }

  await setDay(0);
  await page.evaluate(() => window.__sonics.render());
  check("story screen first", (await page.textContent(".story h2")).includes("phone is ringing"));
  await page.fill("#wName", "Marshall");
  await page.click("#wNext");
  check("nicotine is the default main battle", (await page.textContent(".pick.on")) === "Nicotine");
  check("working out can be a main battle", (await page.$("[data-main=workout]")) !== null);
  check("goal-only items aren't main battles", (await page.$("[data-main=reading]")) === null);
  await page.click("#wNext");
  await page.click("[data-goal=workout]");
  await page.click("[data-goal=skill]");
  check("max two goals", await page.isDisabled("[data-goal=reading]"));
  check("main battle isn't offered as a goal", (await page.$("[data-goal=nicotine]")) === null);
  await page.fill("#gl-skill", "Real estate exam");
  await page.fill("#gq-skill", "Did you study for your real estate exam today?");
  await page.click("#wNext");
  check("details show daily cost", (await page.textContent("#hCost")).includes("$4.26"));
  await page.fill("#wQuit", "2026-10-22");
  await page.click("#wDone");
  let s = await S();
  check("profile saved", s.profile.name === "Marshall" && s.profile.main === "nicotine" && s.profile.goals.length === 2);
  check("custom skill saved", s.profile.goals[1].label === "Real estate exam" && s.profile.goals[1].question.includes("real estate"));
  check("goal times default to 10 AM and 4 PM", s.profile.goals[0].time === "10:00" && s.profile.goals[1].time === "16:00");
  check("no tasks before day 1", (await page.$(".tasks-head")) === null && (await page.textContent("main")).includes("Day 1 is"));

  // Day 1 (Oct 22). At 8 AM only the morning report is open.
  await setDay(1, 8);
  await page.evaluate(() => window.__sonics.render());
  check("8 AM: one open task", await page.evaluate(() => window.__sonics.openTaskCount()) === 1);
  check("8 AM: today badge shows 1", (await page.textContent("#todayBadge")) === "1");
  check("check-in locked until evening", (await page.$("[data-clean]")) === null);
  check("morning report says day 1", (await page.textContent(".task")).includes("Day 1"));
  await page.click("#reportBtn");
  await setDay(1, 21);
  await page.evaluate(() => window.__sonics.render());
  check("9 PM: three open tasks", await page.evaluate(() => window.__sonics.openTaskCount()) === 3);
  await page.click("[data-goal-yes=workout]");
  await page.click("[data-goal-no=skill]");
  s = await S();
  check("goal answers saved", s.goalLog["2026-10-22"].workout === true && s.goalLog["2026-10-22"].skill === false);
  await page.click("[data-clean]");
  await page.waitForSelector(".final");
  s = await S();
  check("check-in plays game 1", s.log.length === 1 && s.log[0].game.no === 1 && s.log[0].date === "2026-10-22");
  check("streak is 1", (await page.textContent("#streak")) === "1");
  check("all tasks done", (await page.textContent("main")).includes("All done for today"));

  // Day 2: a slip. The Sonics lose, the streak resets, the team stays.
  await setDay(2);
  await page.evaluate(() => window.__sonics.render());
  page.once("dialog", d => d.accept());
  await page.click("[data-slip]");
  await page.waitForSelector(".final");
  s = await S();
  check("slip day is a loss", s.log[1].game.result === "L" && s.log[1].game.slip);
  check("slip resets streak", (await page.textContent("#streak")) === "0");
  check("slip keeps roster", s.roster.length === 18);

  // Day 3 skipped. On day 4, last night's check-in is still waiting.
  await setDay(4, 9);
  await page.evaluate(() => window.__sonics.render());
  check("missed day can be caught up", (await page.$('[data-clean="2026-10-24"]')) !== null);
  await page.click('[data-clean="2026-10-24"]');
  await page.click("#contBtn");
  s = await S();
  check("catch-up logs yesterday's game", s.log.some(e => e.date === "2026-10-24" && e.clean && e.game.no === 3));
  check("catch-up gone once done", (await page.$('[data-clean="2026-10-24"]')) === null);

  // Play out the rest of the season.
  for (let d = 4; d < 85; d++) {
    await setDay(d);
    await page.evaluate(() => window.__sonics.checkIn(true));
  }
  s = await S();
  check("season 1 ends after 82 games", s.seasons.length === 1 && s.seasons[0].w + s.seasons[0].l === 82, JSON.stringify(s.seasons[0]));
  check("season 1 is a bad season", s.seasons[0].w <= 25, s.seasons[0].w + " wins");
  check("season 2 begins", s.season === 2);
  await page.evaluate(() => window.__sonics.render());
  check("streak counts consecutive clean days", (await page.textContent("#streak")) === "82");

  // Savings, 85 days after quitting (Oct 22 -> Jan 15), minus 1 slip day.
  await setDay(86, 0);
  const sv = await page.evaluate(() => ({ free: window.__sonics.daysFree(), cost: window.__sonics.costPerDay() }));
  check("cost per day from 12 pouches, 15 per tin, $5.33", Math.abs(sv.cost - 4.264) < 0.001, sv.cost.toFixed(3));
  check("days free = days since quit minus slips", Math.abs(sv.free - 84) < 0.05, sv.free.toFixed(2));  // 0.04 = daylight-saving hour
  await page.evaluate(() => window.__sonics.render());
  check("savings shown on today", (await page.textContent("#moneySaved")) === "$" + (sv.free * sv.cost).toFixed(2));

  // Craving: ride it out.
  await page.click("#craveBtn");
  await page.click("#beatBtn");
  check("craving logged", (await S()).cravings.length === 1);
  await page.click("#okBtn");

  // Every tab renders, with no sideways scrolling on a phone.
  for (const t of ["games", "roster", "news", "more", "today"]) {
    await page.click(`nav button[data-tab=${t}]`);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(`${t} tab fits phone width`, !wide);
  }

  // Edit the plan from More: change the morning report time.
  await page.click("nav button[data-tab=more]");
  check("plan summary shows goals", (await page.textContent("main")).includes("Real estate exam"));
  await page.click("#editPlan");
  await page.click("#wNext");
  await page.click("#wNext");
  await page.fill("#wMorning", "06:30");
  await page.click("#wDone");
  s = await S();
  check("editing the plan keeps progress", s.profile.times.morning === "06:30" && s.log.length === 84 && s.profile.name === "Marshall");

  // Backup and restore.
  const code = JSON.stringify(s);
  await fresh();
  await setDay(0);
  await signUp();
  await page.click("nav button[data-tab=more]");
  await page.fill("#importText", code);
  page.once("dialog", d => d.accept());
  await page.click("#importBtn");
  check("restore brings back progress", (await S()).log.length === 84);

  // A save from before goals and savings existed still loads, and asks for goals.
  await page.evaluate(() => {
    const s = window.__sonics.state; delete s.habit; delete s.cravings; delete s.profile; delete s.goalLog; delete s.reportsRead;
    localStorage.setItem("sonics.v1", JSON.stringify(s));
  });
  await page.reload();
  await setDay(86);
  await page.evaluate(() => window.__sonics.render());
  s = await S();
  check("old saves get a nicotine plan added", s.profile.main === "nicotine" && !!s.habit && Array.isArray(s.cravings));
  check("old saves are asked to pick goals", (await page.$("#pickGoalsBtn")) !== null);
  await page.click("#pickGoalsBtn");
  await page.click("[data-goal=reading]");
  await page.click("#wNext");
  await page.click("#wDone");
  check("picking goals clears the prompt", (await S()).profile.goals.length === 1 && (await page.$("#pickGoalsBtn")) === null);

  // Other main battles.
  await fresh();
  await setDay(0);
  await signUp({ main: "porn" });
  check("non-money quit: no savings, has streak and craving button",
    (await page.$("#moneySaved")) === null && (await page.$("#streak")) !== null && (await page.$("#craveBtn")) !== null);
  await fresh();
  await setDay(0);
  await signUp({ main: "workout" });
  check("working out as main: no craving button", (await page.$("#craveBtn")) === null);
  check("working out as main: asks about working out", (await page.textContent("main")).includes("Did you work out today?"));

  check("no page errors", errors.length === 0, errors.join("; "));
  await page.screenshot({ path: path.join(__dirname, "screenshot.png") });
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.log("CRASH " + e.message); process.exit(1); });
