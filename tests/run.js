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
  check("8 AM: report and lineup open", await page.evaluate(() => window.__sonics.openTaskCount()) === 2);
  check("8 AM: today badge shows 2", (await page.textContent("#todayBadge")) === "2");
  check("report names the hot and cold players", (await page.textContent(".task")).includes("🔥"));
  check("check-in locked until evening", (await page.$("[data-clean]")) === null);
  check("morning report says day 1", (await page.textContent(".task")).includes("Day 1"));
  await page.click("#reportBtn");
  check("reading the report: +1 morale", (await S()).econ.morale === 51);

  // Lineup: pick 5 guards (no big) -> warning; fix it; lock in.
  const guards = await page.evaluate(() => window.__sonics.state.roster.filter(p => /G/.test(p.pos) && !/C|PF/.test(p.pos)).map(p => p.name));
  const bigMan = await page.evaluate(() => window.__sonics.state.roster.find(p => /C/.test(p.pos)).name);
  for (const n of await page.evaluate(() => window.__sonics.starterNames())) await page.click(`[data-start="${n}"]`);
  check("lineup can be cleared", await page.isDisabled("#luSave"));
  for (const n of guards.slice(0, 5)) await page.click(`[data-start="${n}"]`);
  check("no big man warning", (await page.textContent(".warn")).includes("No big man"));
  await page.click(`[data-start="${guards[4]}"]`);
  await page.click(`[data-start="${bigMan}"]`);
  check("warning gone with a big", (await page.$(".warn")) === null);
  await page.click("#luSave");
  s = await S();
  check("lineup saved", s.lineup.length === 5 && s.lineup.includes(bigMan) && s.lineupSet["2026-10-22"] && s.econ.morale === 52);
  check("starters play first", await page.evaluate(b => window.__sonics.starterNames().includes(b), bigMan));
  const lr = await page.evaluate(() => {
    const S_ = window.__sonics, d = "2026-10-22", f = S_.dailyForm(d), st = S_.state, keep = st.lineup;
    const others = st.roster.filter(p => p.name !== f.hot && p.name !== f.cold).map(p => p.name);
    st.lineup = [f.hot].concat(others.slice(0, 4)); const withHot = S_.lineupRating(d);
    st.lineup = [f.cold].concat(others.slice(0, 4)); const withCold = S_.lineupRating(d);
    st.lineup = keep; return withHot - withCold;
  });
  check("starting the hot player beats starting the cold one", lr > 0.5, lr.toFixed(2));
  await setDay(1, 21);
  await page.evaluate(() => window.__sonics.render());
  check("9 PM: four open tasks", await page.evaluate(() => window.__sonics.openTaskCount()) === 4);
  check("day 1 interview question", (await page.textContent(".quote")).includes("Day one"));
  await page.click("#ivSend");
  check("empty answer isn't saved", (await S()).journal.length === 0);
  await page.fill("#ivText", "Today is the day. I'm done with pouches.");
  await page.click("#ivSend");
  s = await S();
  check("interview answer saved to journal", s.journal.length === 1 && s.journal[0].a.includes("done with pouches") && s.journal[0].day === 1);
  check("interview pays revenue, morale and first sponsor",
    s.econ.revenue === 0.75 && s.econ.deals.length === 1 && s.econ.morale === 52 + 2, JSON.stringify([s.econ.revenue, s.econ.morale]));
  check("interview makes a news item", s.news.some(n => n.type === "PRESSER" && n.text.includes("President Marshall")));
  await page.click("[data-goal-yes=workout]");
  await page.click("[data-goal-no=skill]");
  s = await S();
  check("goal answers saved", s.goalLog["2026-10-22"].workout === true && s.goalLog["2026-10-22"].skill === false);
  await page.click("[data-clean]");
  await page.waitForSelector(".final");
  s = await S();
  check("clean check-in: cap space waits for the morning", s.econ.cap === 0 && s.econ.pending.length === 1 && s.econ.pending[0].cap === 0.5);
  check("morale settles overnight toward 50", s.econ.morale === 57 + Math.round((50 - 57) * 0.3), String(s.econ.morale));
  check("check-in plays game 1", s.log.length === 1 && s.log[0].game.no === 1 && s.log[0].date === "2026-10-22");
  check("streak is 1", (await page.textContent("#streak")) === "1");
  check("all tasks done", (await page.textContent("main")).includes("All done for today"));

  // Day 2 morning: collect the cap space.
  await setDay(2, 8);
  await page.evaluate(() => window.__sonics.render());
  check("morning report offers the payout", (await page.textContent(".payout")).includes("$0.5M"));
  await page.click("#reportBtn");
  s = await S();
  check("collecting pays cap space", s.econ.cap === 0.5 && s.econ.pending.length === 0);
  check("Today shows morale and cap", (await page.textContent(".econ-line")).includes("$0.5M"));

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
  check("slip costs morale, no cap space", s.econ.pending.length === 0 && s.econ.ledger.some(l => l.note === "Slip day" && l.morale === -8));

  await setDay(3, 13);
  check("after a slip, the interview asks about it", (await page.evaluate(() => window.__sonics.makeQuestion("2026-10-24"))).includes("Tough day"));

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
  check("offseason starts after game 82", s.phase === "offseason" && s.season === 1);
  check("5 biggest contracts expired (1 slip, no extensions)", s.roster.length === 13 && !s.roster.some(p => p.name === "Gabe Vincent"));
  check("remaining contracts have 1 year left", s.roster.every(p => p.years === 1));
  const cap = await page.evaluate(() => ({ room: window.__sonics.capRoom(), pay: window.__sonics.payroll(), dead: window.__sonics.deadMoney(), earned: window.__sonics.state.econ.cap }));
  check("payroll drops to the remaining real salaries", Math.abs(cap.pay - 20.4) < 0.01, cap.pay.toFixed(2));
  check("cap room = cap + earned - dead money start - payroll", Math.abs(cap.room - (164.961 + cap.earned - (164.961 - 55.09) - cap.pay)) < 0.01, cap.room.toFixed(2));
  check("offseason check-ins don't play games", s.log.filter(e => !e.game).length === 2 && s.offseasonDays === 2);
  await page.evaluate(() => window.__sonics.render());
  check("streak counts consecutive clean days", (await page.textContent("#streak")) === "82");

  // Free agency.
  await page.evaluate(() => window.__sonics.render());
  check("Today shows free agency is open", (await page.$("#goFA")) !== null);
  await page.click("#goFA");
  check("free agency list on Team tab", (await page.$$("[data-offer]")).length > 10);
  const fa = await page.evaluate(() => {
    const top = window.__sonics.availableFAs()[0];
    return { ask: top.ask, price: window.__sonics.priceFor(top), appeal: window.__sonics.appeal() };
  });
  check("a bad team pays 30% more for top free agents (up to the max contract)",
    Math.abs(fa.price - Math.min(57.736, Math.round(fa.ask * 1.3 * 100) / 100)) < 0.01, JSON.stringify(fa));
  check("no asking price above the max contract", await page.evaluate(() => window.__sonics.availableFAs().every(p => window.__sonics.priceFor(p) <= 57.74)));
  const tooMuch = await page.evaluate(() => window.__sonics.signFA(window.__sonics.availableFAs()[0].id, 2));
  check("can't sign without cap room", /Not enough cap room/.test(tooMuch || ""), tooMuch);
  const cheap = await page.evaluate(() => window.__sonics.availableFAs().filter(p => window.__sonics.priceFor(p) <= 1.36).pop());
  await page.fill("#faSearch", cheap.name);
  await page.dispatchEvent("#faSearch", "change");
  check("free agent search works", (await page.$$("[data-offer]")).length >= 1 && (await page.$(`[data-offer="${cheap.id}"]`)) !== null);
  page.once("dialog", d => d.accept("3"));
  await page.click(`[data-offer="${cheap.id}"]`);
  s = await S();
  check("minimum deal signs with no room", s.roster.length === 14 && s.roster.some(p => p.id === cheap.id && p.years === 3));
  check("signed player leaves the pool", !(await page.evaluate(id => window.__sonics.availableFAs().some(p => p.id === id), cheap.id)));
  await page.evaluate(() => { window.__sonics.state.econ.cap += 60; });
  const big = await page.evaluate(() => {
    const p = window.__sonics.availableFAs().find(p => window.__sonics.priceFor(p) > 20 && window.__sonics.priceFor(p) < window.__sonics.capRoom());
    return { id: p.id, err: window.__sonics.signFA(p.id, 2), price: window.__sonics.priceFor(p) };
  });
  check("with room, a big free agent signs", big.err === null && (await S()).roster.length === 15, JSON.stringify(big));
  // Finish the offseason: 5 more check-ins, then season 2.
  for (let d = 85; d < 90; d++) { await setDay(d); await page.evaluate(() => window.__sonics.checkIn(true)); }
  s = await S();
  check("season 2 begins after 7 offseason days", s.phase === "season" && s.season === 2 && s.schedule.length === 82);
  check("other teams signed some free agents", s.faGone.length > 0, String(s.faGone.length));
  await setDay(90);
  await page.evaluate(() => window.__sonics.checkIn(true));
  check("season 2 game 1 plays", (await S()).log.slice(-1)[0].game.no === 1);

  // Savings, 85 days after quitting (Oct 22 -> Jan 15), minus 1 slip day.
  await page.click("nav button[data-tab=today]");
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
  for (let i = 0; i < 3; i++) { await page.click("#craveBtn"); await page.click("#beatBtn"); await page.click("#okBtn"); }
  check("only 3 cravings a day pay", (await S()).econ.ledger.filter(l => l.note === "Craving beaten").length === 3);

  // Morale changes games: same seed, same game, higher morale = bigger margin.
  const margins = await page.evaluate(() => {
    const st = window.__sonics.state, keep = st.econ.morale, out = [];
    for (const m of [0, 100]) { st.econ.morale = m; out.push(window.__sonics.playGame(true)); }
    st.econ.morale = keep;
    return out.map(g => g.my - g.them);
  });
  check("morale 100 plays 10 points better than morale 0", margins[1] - margins[0] === 10, JSON.stringify(margins));

  // Stadium: not enough revenue, then enough.
  await page.evaluate(() => { window.__sonics.state.econ.revenue = 1; });
  await page.click("nav button[data-tab=roster]");
  check("stadium upgrade needs revenue", await page.isDisabled("#upgradeBtn"));
  await page.evaluate(() => { window.__sonics.state.econ.revenue = 5; window.__sonics.render(); });
  page.once("dialog", d => d.accept());
  await page.click("#upgradeBtn");
  s = await S();
  check("stadium upgraded", s.econ.stadium === 1 && s.econ.revenue === 2 && (await page.textContent("main")).includes("Locker room refresh"));

  // Every tab renders, with no sideways scrolling on a phone.
  for (const t of ["games", "journal", "roster", "news", "more", "today"]) {
    await page.click(`nav button[data-tab=${t}]`);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(`${t} tab fits phone width`, !wide);
  }

  // Journal: shows the interview, add a note, delete it.
  await page.click("nav button[data-tab=journal]");
  check("journal shows the interview", (await page.textContent("main")).includes("done with pouches"));
  await page.fill("#noteText", "Craving at lunch, went for a walk.");
  await page.click("#noteSave");
  check("note saved", (await S()).journal.length === 2 && (await page.textContent("main")).includes("went for a walk"));
  page.once("dialog", d => d.accept());
  await page.click('[data-del="1"]');
  check("note deleted", (await S()).journal.length === 1);
  // Interview skip.
  await setDay(87, 13);
  await page.click("nav button[data-tab=today]");
  await page.click("#ivSkip");
  check("interview can be skipped", (await S()).interviews["2027-01-16"].status === "skipped" && (await S()).journal.length === 1);

  // Edit the plan from More: change the morning report time.
  await page.click("nav button[data-tab=more]");
  check("plan summary shows goals", (await page.textContent("main")).includes("Real estate exam"));
  await page.click("#editPlan");
  await page.click("#wNext");
  await page.click("#wNext");
  await page.fill("#wMorning", "06:30");
  await page.click("#wDone");
  s = await S();
  check("editing the plan keeps progress", s.profile.times.morning === "06:30" && s.log.length === 90 && s.profile.name === "Marshall");

  // Backup and restore.
  const code = JSON.stringify(s);
  await fresh();
  await setDay(0);
  await signUp();
  await page.click("nav button[data-tab=more]");
  await page.fill("#importText", code);
  page.once("dialog", d => d.accept());
  await page.click("#importBtn");
  check("restore brings back progress", (await S()).log.length === 90);

  // A save from before goals and savings existed still loads, and asks for goals.
  await page.evaluate(() => {
    const s = window.__sonics.state; delete s.habit; delete s.cravings; delete s.profile; delete s.goalLog; delete s.reportsRead; delete s.journal; delete s.interviews;
    localStorage.setItem("sonics.v1", JSON.stringify(s));
  });
  await page.reload();
  await setDay(86);
  await page.evaluate(() => window.__sonics.render());
  s = await S();
  check("old saves get a nicotine plan added", s.profile.main === "nicotine" && !!s.habit && Array.isArray(s.cravings));
  check("old saves get the interview", s.profile.times.interview === "12:00" && Array.isArray(s.journal));
  check("old saves are asked to pick goals", (await page.$("#pickGoalsBtn")) !== null);
  await page.click("#pickGoalsBtn");
  await page.click("[data-goal=reading]");
  await page.click("#wNext");
  await page.click("#wDone");
  check("picking goals clears the prompt", (await S()).profile.goals.length === 1 && (await page.$("#pickGoalsBtn")) === null);

  // Passcode: set it, get locked out on reopen, wrong code rejected, right code opens, turn it off.
  const typeCode = async code => { for (const k of code) await page.click(`[data-key="${k}"]`); await page.waitForTimeout(50); };
  page.on("dialog", d => d.accept());
  await page.click("nav button[data-tab=more]");
  await page.click("#lockBtn");
  await typeCode("1234");
  await typeCode("9999");
  check("mismatched passcode is rejected", (await page.textContent("#padMsg")).includes("didn't match"));
  await typeCode("1234");
  check("passcode saved (hashed, not the digits)", await page.evaluate(() => {
    const l = window.__sonics.state.lock; return !!l && !JSON.stringify(l).includes("1234");
  }));
  await page.reload();
  await setDay(86);
  await page.evaluate(() => window.__sonics.render());
  check("app opens locked", (await page.textContent(".lock h2")) === "Sonics locked" && await page.isHidden("nav"));
  await typeCode("0000");
  check("wrong passcode stays locked", (await page.textContent("#padMsg")).includes("Wrong") && await page.evaluate(() => window.__sonics.locked));
  await typeCode("1234");
  check("right passcode unlocks", !(await page.evaluate(() => window.__sonics.locked)) && (await page.$(".tasks-head")) !== null);
  await page.click("nav button[data-tab=more]");
  await page.click("#lockBtn");
  await typeCode("1234");
  check("passcode can be turned off", !(await S()).lock);
  page.removeAllListeners("dialog");

  // Too many slips: big expiring contracts get extended.
  await fresh();
  await setDay(0);
  await signUp();
  const ext = await page.evaluate(() => {
    for (let i = 0; i < 82; i++) {
      window.__fakeNow = () => new Date(2026, 9, 21 + i, 21);
      window.__sonics.checkIn(i >= 5);   // 5 slips = 2 over the 3 free ones
    }
    const s = window.__sonics.state;
    return { phase: s.phase, n: s.roster.length, kept: s.roster.filter(p => p.salary > 6).map(p => p.name + ":" + p.years) };
  });
  check("5 slips extends the 2 biggest expiring contracts", ext.phase === "offseason" && ext.n === 15 &&
    ext.kept.includes("Gabe Vincent:1") && ext.kept.includes("Cam Thomas:1"), JSON.stringify(ext));

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
