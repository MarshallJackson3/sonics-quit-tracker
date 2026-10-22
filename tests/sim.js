// Balance check (not a test): one year of clean days, good morale, sensible free agency.
const { chromium } = require("playwright");
const path = require("path");
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto("file://" + path.resolve(__dirname, "../app/index.html"));
  const out = await p.evaluate(() => {
    const S = window.__sonics; window.__fast = true;
    window.__fakeNow = () => new Date(2026, 9, 22, 21);
    let st = S.newState(); st.habit.quitDate = "2026-10-22";
    localStorage.setItem("sonics.v1", JSON.stringify(st));
    return true;
  });
  await p.reload();
  const res = await p.evaluate(() => {
    const S = window.__sonics, log = [];
    for (let i = 0; i < 400; i++) {
      window.__fakeNow = () => new Date(2026, 9, 22 + i, 21);
      const st = S.state;
      st.econ.morale = 75;
      st.econ.cap += st.econ.pending.reduce((a, x) => a + (x.cap || 0), 0) + 0.1; st.econ.pending = [];
      if (st.phase === "offseason" && st.offseasonDays === 0) {
        // Sign the best players that fit, like a sensible owner would.
        for (let k = 0; k < 6; k++) {
          const fa = S.availableFAs().filter(f => S.interested(f) && S.priceFor(f) <= Math.max(S.capRoom(), 1.36))
            .sort((a, b) => (b.bpm * b.g * b.mp) - (a.bpm * a.g * a.mp))[0];
          if (!fa || st.roster.length >= 18) break;
          S.signFA(fa.id, 3);
        }
      }
      S.checkIn(true);
      if ([30, 90, 180, 270, 365].includes(i)) log.push({ day: i + 1, season: st.season, phase: st.phase, rating: +S.lineupRating("2027-01-01").toFixed(1),
        coach: st.coach.name, coachBonus: +S.coachBonus().toFixed(1), gm: st.gm.name, trades: st.news.filter(n => n.type === "TRADE").length, room: +S.capRoom().toFixed(1) });
    }
    return { log, seasons: S.state.seasons, best: S.state.roster.slice().sort((a, b) => b.bpm - a.bpm).slice(0, 3).map(p => p.name + " " + p.bpm) };
  });
  console.log(JSON.stringify(res, null, 1));
  await b.close();
})();
