// Workout tracker and progress photos for Fuel Log. The main page creates this
// with its state, storage and helpers: window.TrainUI(app).
(function () {
  window.TrainUI = function (app) {
    const W = window.Workouts;
    const { S, store, $, esc, flash } = app;
    const MUSCLES = ["chest", "shoulders", "triceps", "biceps", "forearms", "lats", "upper back", "traps", "lower back", "abs", "obliques", "quads", "hamstrings", "glutes", "calves", "adductors", "abductors", "neck", "full body", "cardio"];
    const EQUIPMENT = ["Barbell", "Dumbbell", "Machine", "Cable", "Smith Machine", "Kettlebell", "EZ Bar", "Trap Bar", "Band", "Bodyweight", "Plate", "Assisted", "Weighted", "Landmine", "Other"];
    const TYPES = { wr: "Weight and reps", bw: "Bodyweight reps", as: "Assisted (kg of help)", du: "Time", cd: "Distance and time" };
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

    // ---------- Exercises ----------
    let indexCache = null, indexKey = "";
    function exIndex() {
      const key = Object.keys(S.exercises).join("|");
      if (!indexCache || key !== indexKey) {
        indexCache = Object.fromEntries((window.EXERCISES || []).concat(Object.values(S.exercises)).map((e) => [e.id, e]));
        indexKey = key;
      }
      return indexCache;
    }
    const exDef = (id) => exIndex()[id] || { id, name: "Deleted exercise", primary: "full body", secondary: [], equipment: "Other", type: "wr" };

    // ---------- Units ----------
    const lb = () => app.unit() === "lb";
    const wOut = (kg) => { if (kg == null || kg === "") return ""; const v = lb() ? Math.round(kg * 2.20462 * 2) / 2 : Math.round(kg * 100) / 100; return String(v); };
    const wIn = (v) => { const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? Math.round((lb() ? n / 2.20462 : n) * 100) / 100 : null; };
    const wu = () => app.unit();
    const secOut = (s) => (s == null || s === "" ? "" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
    const secIn = (v) => { v = String(v).trim(); if (!v) return null; if (v.includes(":")) { const [m, s] = v.split(":").map(Number); return (m || 0) * 60 + (s || 0); } const n = Number(v); return isFinite(n) ? n : null; };
    const fmtVol = (kg) => (lb() ? Math.round(kg * 2.20462) : Math.round(kg)).toLocaleString("en-GB") + " " + wu();
    function fmtSet(s, type) {
      if (!s) return "–";
      if (type === "du") return secOut(s.sec) || "–";
      if (type === "cd") return `${s.km ?? "–"} km${s.sec ? " · " + secOut(s.sec) : ""}`;
      const kg = s.kg ? wOut(s.kg) : "";
      if (type === "bw") return kg ? `+${kg} ${wu()} × ${s.reps ?? "–"}` : `${s.reps ?? "–"} reps`;
      if (type === "as") return `−${kg || 0} ${wu()} × ${s.reps ?? "–"}`;
      return `${kg || 0} ${wu()} × ${s.reps ?? "–"}`;
    }
    const fmtDate = (d, opts = { weekday: "short", day: "numeric", month: "short" }) => new Date(d + "T12:00").toLocaleDateString("en-GB", opts);
    const fmtDur = (min) => (min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`);

    // ---------- Sheet helper ----------
    function sheet(html, bind) { app.sheet(html, bind); }
    const head = (title) => `<div class="row spread"><h2>${title}</h2><button class="x" type="button" data-close aria-label="Close">×</button></div>`;

    // ---------- Rest timer, elapsed clock, wake lock ----------
    let rest = null, audio = null, wake = null;
    const restBar = document.createElement("div");
    restBar.className = "restbar"; restBar.hidden = true; restBar.setAttribute("role", "timer");
    restBar.innerHTML = `<span>Rest <strong class="num" id="rest-left">0:00</strong></span><span class="row" style="gap:6px"><button type="button" data-rest="-15">−15</button><button type="button" data-rest="15">+15</button><button type="button" data-rest="skip">Skip</button></span>`;
    document.body.appendChild(restBar);
    restBar.addEventListener("click", (e) => {
      const b = e.target.closest("[data-rest]"); if (!b || !rest) return;
      if (b.dataset.rest === "skip") rest = null; else rest.end += Number(b.dataset.rest) * 1000;
      tick();
    });
    function beep() {
      try {
        audio = audio || new (window.AudioContext || window.webkitAudioContext)();
        const o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(audio.destination);
        o.start(); o.stop(audio.currentTime + 0.25);
      } catch (e) {}
    }
    function startRest(sec) {
      if (!(sec > 0)) return;
      try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
      rest = { end: Date.now() + sec * 1000 };
      tick();
    }
    function tick() {
      if (rest) {
        const left = Math.round((rest.end - Date.now()) / 1000);
        if (left <= 0) { rest = null; beep(); if (navigator.vibrate) navigator.vibrate([200, 100, 200]); }
        else { restBar.hidden = false; restBar.querySelector("#rest-left").textContent = secOut(left); }
      }
      if (!rest) restBar.hidden = true;
      const el = document.getElementById("wk-elapsed");
      if (el && S.active) el.textContent = clock(Date.now() - S.active.start);
      const bn = document.getElementById("wk-banner-time");
      if (bn && S.active) bn.textContent = clock(Date.now() - S.active.start);
    }
    setInterval(tick, 500);
    const clock = (ms) => { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s % 60).padStart(2, "0"); };
    async function keepAwake() {
      if (!S.active || wake || !("wakeLock" in navigator) || document.visibilityState !== "visible") return;
      try { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => (wake = null)); } catch (e) {}
    }
    document.addEventListener("visibilitychange", keepAwake);

    // ---------- Active workout ----------
    let saveTimer = null;
    function saveActive(now) {
      clearTimeout(saveTimer); saveTimer = null;
      if (now) store.active(S.active); else saveTimer = setTimeout(() => { saveTimer = null; store.active(S.active); }, 700);
    }
    // Typing is saved after a pause; never lose it when the app is closed or hidden.
    const flush = () => { if (saveTimer) saveActive(true); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
    const blankSet = (type = "n") => ({ type, kg: null, reps: null, sec: null, km: null, done: false });
    function startWorkout({ name, exercises, routineId }) {
      if (S.active) { flash("Finish or discard the workout in progress first."); app.go("train"); return; }
      S.active = { id: "wk-" + app.uid(), name: name || defaultName(), start: Date.now(), routineId: routineId || null, exercises: exercises || [] };
      saveActive(true); keepAwake(); app.go("train");
    }
    function defaultName() {
      const h = new Date().getHours();
      return h < 12 ? "Morning workout" : h < 17 ? "Afternoon workout" : "Evening workout";
    }
    const exFromRoutine = (re) => ({ exId: re.exId, rest: re.rest ?? 90, range: re.range || [8, 12], note: "", sets: Array.from({ length: re.sets || 3 }, () => blankSet()) });

    function targetFor(ex) {
      const def = exDef(ex.exId);
      return W.nextTarget(def, S.workouts, ex.range || [8, 12], S.active ? S.active.start : Infinity);
    }

    function activeView() {
      const a = S.active, idx = exIndex();
      let vol = 0, done = 0;
      for (const ex of a.exercises) for (const s of ex.sets) if (s.done && s.type !== "w") { done++; vol += (s.kg || 0) * (s.reps || 0); }
      const cards = a.exercises.map((ex, i) => {
        const def = exDef(ex.exId), t = def.type;
        const prev = W.previous(ex.exId, S.workouts, a.start);
        const tgt = targetFor(ex);
        const cols = t === "du" ? ["Time"] : t === "cd" ? ["km", "Time"] : [t === "bw" ? "+" + wu() : t === "as" ? "−" + wu() : wu(), "Reps"];
        let n = 0;
        const rows = ex.sets.map((s, j) => {
          const label = s.type === "n" ? ++n : s.type.toUpperCase();
          const p = prev && (prev.sets.filter((x) => x.type === s.type)[s.type === "n" ? n - 1 : 0] || null);
          const ph = (f) => {
            if (s.type === "n" && tgt && (f === "kg" || f === "reps")) return f === "kg" ? wOut(tgt.kg) : tgt.reps;
            if (!p) return "";
            return f === "kg" ? wOut(p.kg) : f === "sec" ? secOut(p.sec) : p[f] ?? "";
          };
          const inp = (f, mode) => {
            const val = f === "kg" ? wOut(s.kg) : f === "sec" ? secOut(s.sec) : s[f] ?? "";
            return `<td><input class="si" data-set="${i}:${j}" data-f="${f}" inputmode="${mode}" value="${esc(val)}" placeholder="${esc(ph(f))}" aria-label="${f} set ${j + 1}"></td>`;
          };
          const fields = t === "du" ? inp("sec", "numeric") : t === "cd" ? inp("km", "decimal") + inp("sec", "numeric") : inp("kg", "decimal") + inp("reps", "numeric");
          return `<tr class="${s.done ? "done" : ""}"><td><button type="button" class="stype st-${s.type}" data-stype="${i}:${j}" aria-label="Set ${label} options">${label}</button></td>
            <td class="prev" data-prev="${i}:${j}">${p ? esc(fmtSet(p, t)) : "–"}${s.pr && s.pr.length ? ` <span class="prb">PR</span>` : ""}</td>${fields}
            <td><button type="button" class="chk" data-done="${i}:${j}" aria-pressed="${s.done}" aria-label="Complete set ${j + 1}">✓</button></td></tr>`;
        }).join("");
        return `<section class="card ex-card">
          <div class="row spread"><button type="button" class="exname" data-exinfo="${esc(ex.exId)}">${esc(def.name)}</button><button class="btn ghost small" type="button" data-exmenu="${i}" aria-label="Exercise options">•••</button></div>
          ${tgt ? `<p class="hint">${tgt.up ? "↑ " : ""}${esc(lb() ? tgt.text.replace(/(\d+(?:\.\d+)?) kg/g, (_, k) => `${wOut(Number(k))} lb`) : tgt.text)}</p>` : ""}
          <input class="note" data-note="${i}" value="${esc(ex.note || "")}" placeholder="Add a note" aria-label="Note">
          <div style="overflow-x:auto"><table class="sets"><thead><tr><th>Set</th><th>Previous</th>${cols.map((c) => `<th>${c}</th>`).join("")}<th aria-label="Done"></th></tr></thead><tbody>${rows}</tbody></table></div>
          <div class="row spread"><button class="btn ghost small" type="button" data-addset="${i}">+ Add set</button><span class="small muted">Rest ${ex.rest ? secOut(ex.rest) : "off"} · ${(ex.range || [8, 12]).join("–")} reps</span></div>
        </section>`;
      }).join("");
      return `<div class="app" style="gap:14px">
        <section class="card">
          <div class="row spread"><input class="wk-name" id="wk-name" value="${esc(a.name)}" aria-label="Workout name"><button class="btn" type="button" id="wk-finish">Finish</button></div>
          <div class="row small muted" style="gap:14px"><span>⏱ <strong class="num" id="wk-elapsed">${clock(Date.now() - a.start)}</strong></span><span>${done} sets</span><span>${fmtVol(vol)}</span></div>
        </section>
        ${cards || `<div class="card"><p class="empty" style="margin:0">Add your first exercise to start logging sets.</p></div>`}
        <button class="btn wide" type="button" id="wk-add">+ Add exercises</button>
        <button class="link" type="button" id="wk-discard" style="justify-self:center;color:var(--protein)">Discard workout</button>
      </div>`;
    }

    function bindActive() {
      const v = $("#view");
      $("#wk-name").oninput = (e) => { S.active.name = e.target.value; saveActive(); };
      v.querySelectorAll(".si").forEach((inp) => {
        inp.oninput = () => {
          const [i, j] = inp.dataset.set.split(":").map(Number), f = inp.dataset.f, s = S.active.exercises[i].sets[j];
          s[f] = f === "kg" ? wIn(inp.value) : f === "sec" ? secIn(inp.value) : f === "km" ? (parseFloat(inp.value) || null) : (parseInt(inp.value, 10) || null);
          saveActive();
        };
        inp.onfocus = () => inp.select();
      });
      v.querySelectorAll("[data-note]").forEach((n) => (n.oninput = () => { S.active.exercises[Number(n.dataset.note)].note = n.value; saveActive(); }));
      v.querySelectorAll("[data-prev]").forEach((td) => (td.onclick = () => {
        const [i, j] = td.dataset.prev.split(":").map(Number);
        const ex = S.active.exercises[i], prev = W.previous(ex.exId, S.workouts, S.active.start);
        const p = prev && prev.sets.filter((x) => x.type === ex.sets[j].type)[0 + ex.sets.slice(0, j).filter((x) => x.type === ex.sets[j].type).length];
        if (!p) return;
        Object.assign(ex.sets[j], { kg: p.kg ?? null, reps: p.reps ?? null, sec: p.sec ?? null, km: p.km ?? null });
        saveActive(true); app.render();
      }));
      v.querySelectorAll("[data-done]").forEach((b) => (b.onclick = () => {
        const [i, j] = b.dataset.done.split(":").map(Number);
        const ex = S.active.exercises[i], s = ex.sets[j], def = exDef(ex.exId);
        if (!s.done) {
          // Empty fields take the suggested or previous values, as shown in grey.
          const row = b.closest("tr");
          row.querySelectorAll(".si").forEach((inp) => {
            if (inp.value === "" && inp.placeholder !== "") { inp.value = inp.placeholder; inp.oninput(); }
          });
          const ok = def.type === "du" ? s.sec > 0 : def.type === "cd" ? s.km > 0 || s.sec > 0 : s.reps > 0;
          if (!ok) { flash(def.type === "du" ? "Enter a time for this set." : def.type === "cd" ? "Enter a distance or time." : "Enter the reps for this set."); return; }
          s.done = true;
          s.pr = W.setPRs(s, def, S.workouts, S.active.start);
          if (s.pr.length && navigator.vibrate) navigator.vibrate(80);
          startRest(s.type === "w" ? Math.min(60, ex.rest || 0) : ex.rest);
        } else { s.done = false; s.pr = []; }
        saveActive(true); app.render();
      }));
      v.querySelectorAll("[data-stype]").forEach((b) => (b.onclick = () => {
        const [i, j] = b.dataset.stype.split(":").map(Number);
        sheet(head("Set " + (j + 1)) + `<div class="choices">${Object.entries(W.SET_TYPES).map(([k, l]) => `<button class="choice" type="button" data-t="${k}"><strong>${l}</strong><span>${{ n: "Counts toward records and volume", w: "Lighter; excluded from records", d: "Straight after the set before, lighter", f: "Taken to failure" }[k]}</span></button>`).join("")}</div>
          <button class="btn ghost wide" type="button" id="set-del" style="color:var(--protein)">Delete set</button>`, (el) => {
          el.querySelectorAll("[data-t]").forEach((c) => (c.onclick = () => { S.active.exercises[i].sets[j].type = c.dataset.t; saveActive(true); app.closeSheet(); app.render(); }));
          el.querySelector("#set-del").onclick = () => { S.active.exercises[i].sets.splice(j, 1); saveActive(true); app.closeSheet(); app.render(); };
        });
      }));
      v.querySelectorAll("[data-addset]").forEach((b) => (b.onclick = () => {
        const ex = S.active.exercises[Number(b.dataset.addset)], last = ex.sets[ex.sets.length - 1];
        ex.sets.push(last ? { ...blankSet(last.type === "w" ? "n" : last.type), kg: last.kg, reps: null, sec: last.sec, km: null } : blankSet());
        saveActive(true); app.render();
      }));
      v.querySelectorAll("[data-exmenu]").forEach((b) => (b.onclick = () => exerciseMenu(Number(b.dataset.exmenu))));
      v.querySelectorAll("[data-exinfo]").forEach((b) => (b.onclick = () => openExercise(b.dataset.exinfo)));
      $("#wk-add").onclick = () => picker((ids) => { for (const id of ids) S.active.exercises.push(exFromRoutine({ exId: id })); saveActive(true); app.render(); });
      $("#wk-finish").onclick = finishPrompt;
      $("#wk-discard").onclick = () => sheet(head("Discard workout?") + `<p style="margin:0">Nothing from this workout will be saved.</p><div class="row"><button class="btn" type="button" id="dc-yes" style="flex:1;background:var(--protein);color:#fff">Discard</button><button class="btn ghost" type="button" data-close>Keep going</button></div>`, (el) => {
        el.querySelector("#dc-yes").onclick = () => { S.active = null; rest = null; saveActive(true); app.closeSheet(); app.render(); };
      });
      keepAwake();
    }

    function exerciseMenu(i) {
      const ex = S.active.exercises[i], n = S.active.exercises.length;
      sheet(head(esc(exDef(ex.exId).name)) + `
        <div class="grid2"><label class="field"><span>Rep range, low</span><input type="number" id="rr-lo" inputmode="numeric" value="${(ex.range || [8, 12])[0]}"></label><label class="field"><span>Rep range, high</span><input type="number" id="rr-hi" inputmode="numeric" value="${(ex.range || [8, 12])[1]}"></label></div>
        <label class="field"><span>Rest timer</span><select id="rr-rest">${[0, 30, 45, 60, 90, 120, 150, 180, 240, 300].map((s) => `<option value="${s}" ${s === (ex.rest || 0) ? "selected" : ""}>${s ? secOut(s) : "Off"}</option>`).join("")}</select></label>
        <div class="row"><button class="btn ghost small" type="button" id="mv-up" ${i === 0 ? "disabled" : ""}>Move up</button><button class="btn ghost small" type="button" id="mv-dn" ${i === n - 1 ? "disabled" : ""}>Move down</button><button class="btn ghost small" type="button" id="ex-swap">Replace</button></div>
        <div class="row"><button class="btn" type="button" id="ex-save" style="flex:1">Save</button><button class="btn ghost" type="button" id="ex-rm" style="color:var(--protein)">Remove</button></div>`, (el) => {
        const move = (d) => { const arr = S.active.exercises; [arr[i], arr[i + d]] = [arr[i + d], arr[i]]; saveActive(true); app.closeSheet(); app.render(); };
        el.querySelector("#mv-up").onclick = () => move(-1);
        el.querySelector("#mv-dn").onclick = () => move(1);
        el.querySelector("#ex-swap").onclick = () => picker((ids) => { if (ids[0]) { ex.exId = ids[0]; for (const s of ex.sets) if (!s.done) Object.assign(s, { kg: null, reps: null }); saveActive(true); app.render(); } }, { single: true });
        el.querySelector("#ex-rm").onclick = () => { S.active.exercises.splice(i, 1); saveActive(true); app.closeSheet(); app.render(); };
        el.querySelector("#ex-save").onclick = () => {
          const lo = Number(el.querySelector("#rr-lo").value) || 8, hi = Math.max(lo, Number(el.querySelector("#rr-hi").value) || 12);
          ex.range = [lo, hi]; ex.rest = Number(el.querySelector("#rr-rest").value);
          saveActive(true); app.closeSheet(); app.render();
        };
      });
    }

    function finishPrompt() {
      const a = S.active;
      const done = a.exercises.reduce((n, ex) => n + ex.sets.filter((s) => s.done).length, 0);
      const undone = a.exercises.reduce((n, ex) => n + ex.sets.filter((s) => !s.done).length, 0);
      if (!done) { flash("Tick off at least one set before finishing, or discard the workout."); return; }
      sheet(head("Finish workout?") + `<p style="margin:0">${done} completed set${done > 1 ? "s" : ""}.${undone ? ` ${undone} unticked set${undone > 1 ? "s" : ""} will be left out.` : ""}</p>
        <div class="row"><button class="btn" type="button" id="fin-yes" style="flex:1">Finish</button><button class="btn ghost" type="button" data-close>Keep going</button></div>`, (el) => {
        el.querySelector("#fin-yes").onclick = finish;
      });
    }
    function finish() {
      const a = S.active;
      const w = {
        id: a.id, name: a.name.trim() || defaultName(), start: a.start, end: Date.now(), date: app.iso(new Date(a.start)), routineId: a.routineId || null,
        exercises: a.exercises.map((ex) => ({ exId: ex.exId, note: ex.note || "", range: ex.range, rest: ex.rest, sets: ex.sets.filter((s) => s.done).map(({ type, kg, reps, sec, km }) => ({ type, kg, reps, sec, km, done: true })) })).filter((ex) => ex.sets.length),
      };
      const sum = W.summary(w, exIndex(), S.workouts);
      store.workout(w);
      S.active = null; rest = null; saveActive(true);
      if (wake) { wake.release().catch(() => {}); wake = null; }
      app.render();
      const count = Object.keys(S.workouts).length;
      sheet(head("Workout saved") + `
        <div class="preview"><div><b>${fmtDur(sum.durationMin)}</b><span>time</span></div><div><b>${sum.sets}</b><span>sets</span></div><div><b style="font-size:1.1rem">${fmtVol(sum.volume)}</b><span>volume</span></div><div><b>${sum.prs.length}</b><span>PRs</span></div></div>
        ${sum.prs.length ? `<div class="grid2" style="grid-template-columns:minmax(0,1fr);gap:6px">${sum.prs.map((p) => `<div class="pr-row"><span class="prb">PR</span> ${esc(p.exercise)}: ${{ weight: "heaviest weight", "1RM": "best estimated 1RM", reps: "most reps", time: "longest time", distance: "furthest distance" }[p.kind]}, ${esc(fmtSet(p.set, exDef(w.exercises.find((e) => exDef(e.exId).name === p.exercise)?.exId).type))}</div>`).join("")}</div>` : ""}
        <p class="small muted" style="margin:0">Workout ${count}. ${w.routineId ? "" : "Save it as a routine to repeat it with one tap."}</p>
        <div class="row">${w.routineId ? "" : `<button class="btn ghost" type="button" id="as-routine">Save as routine</button>`}<button class="btn" type="button" data-close style="flex:1">Done</button></div>`, (el) => {
        const r = el.querySelector("#as-routine");
        if (r) r.onclick = () => { routineFromWorkout(w); app.closeSheet(); flash(`Saved "${w.name}" as a routine.`, "good"); app.render(); };
      });
    }
    function routineFromWorkout(w) {
      store.routine({ id: "rt-" + app.uid(), name: w.name, exercises: w.exercises.map((ex) => ({ exId: ex.exId, sets: ex.sets.filter((s) => s.type !== "w").length || ex.sets.length, range: ex.range || [8, 12], rest: ex.rest ?? 90 })) });
    }

    // ---------- Exercise picker ----------
    function picker(done, opts = {}) {
      let q = "", muscle = "", chosen = [];
      const used = {};
      for (const w of Object.values(S.workouts)) for (const ex of w.exercises || []) used[ex.exId] = Math.max(used[ex.exId] || 0, w.start);
      const draw = () => {
        const words = q.toLowerCase().split(/\s+/).filter(Boolean);
        const list = Object.values(exIndex())
          .filter((e) => (!muscle || e.primary === muscle || e.secondary.includes(muscle)) && words.every((w) => (e.name + " " + e.primary + " " + e.equipment).toLowerCase().includes(w)))
          .sort((a, b) => (used[b.id] || 0) - (used[a.id] || 0) || (muscle ? (a.primary === muscle ? 0 : 1) - (b.primary === muscle ? 0 : 1) : 0) || a.name.localeCompare(b.name))
          .slice(0, 120);
        const el = $("#sheet-body");
        el.innerHTML = head(opts.single ? "Choose exercise" : "Add exercises") + `
          <input type="search" id="pk-q" placeholder="Search ${Object.keys(exIndex()).length} exercises" value="${esc(q)}" aria-label="Search exercises">
          <div class="chips" style="max-height:72px;overflow-y:auto"><button type="button" data-m="" aria-pressed="${!muscle}">All</button>${MUSCLES.map((m) => `<button type="button" data-m="${m}" aria-pressed="${muscle === m}">${cap(m)}</button>`).join("")}</div>
          <div class="results" style="max-height:46vh">${list.map((e) => `<button type="button" class="result pick ${chosen.includes(e.id) ? "on" : ""}" data-x="${esc(e.id)}"><span><span>${esc(e.name)}</span><br><span class="small muted">${cap(e.primary)}${used[e.id] ? " · done before" : ""}</span></span><span class="tick" aria-hidden="true">${chosen.includes(e.id) ? "✓" : "+"}</span></button>`).join("") || `<p class="empty">No exercises match.</p>`}</div>
          <div class="row"><button class="btn ghost small" type="button" id="pk-new">Create exercise</button>${opts.single ? "" : `<button class="btn" type="button" id="pk-add" style="flex:1" ${chosen.length ? "" : "disabled"}>Add ${chosen.length || ""} exercise${chosen.length === 1 ? "" : "s"}</button>`}</div>`;
        const qi = el.querySelector("#pk-q");
        qi.oninput = () => { q = qi.value; const p = qi.selectionStart; draw(); const n = $("#pk-q"); n.focus(); n.setSelectionRange(p, p); };
        el.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => { muscle = b.dataset.m; draw(); }));
        el.querySelectorAll("[data-x]").forEach((b) => (b.onclick = () => {
          const id = b.dataset.x;
          if (opts.single) { app.closeSheet(); done([id]); return; }
          chosen = chosen.includes(id) ? chosen.filter((x) => x !== id) : chosen.concat(id);
          const sc = el.querySelector(".results").scrollTop; draw(); $("#sheet-body .results").scrollTop = sc;
        }));
        const add = el.querySelector("#pk-add"); if (add) add.onclick = () => { app.closeSheet(); done(chosen); };
        el.querySelector("#pk-new").onclick = () => customExercise((id) => { if (opts.single) { app.closeSheet(); done([id]); } else { chosen.push(id); draw(); } }, draw);
        el.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => app.closeSheet()));
      };
      app.sheet("", draw);
    }

    function customExercise(saved, back) {
      const el = $("#sheet-body");
      el.innerHTML = head("New exercise") + `
        <label class="field"><span>Name</span><input type="text" id="cx-name" placeholder="e.g. Cable Y Raise"></label>
        <div class="grid2"><label class="field"><span>Main muscle</span><select id="cx-m">${MUSCLES.map((m) => `<option value="${m}">${cap(m)}</option>`).join("")}</select></label>
        <label class="field"><span>Equipment</span><select id="cx-e">${EQUIPMENT.map((m) => `<option>${m}</option>`).join("")}</select></label></div>
        <label class="field"><span>What you log</span><select id="cx-t">${Object.entries(TYPES).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>
        <div class="row"><button class="btn" type="button" id="cx-save" style="flex:1">Save exercise</button><button class="btn ghost" type="button" id="cx-back">Back</button></div>`;
      el.querySelector("#cx-back").onclick = back;
      el.querySelector("[data-close]").onclick = () => app.closeSheet();
      el.querySelector("#cx-save").onclick = () => {
        const name = el.querySelector("#cx-name").value.trim();
        if (!name) { el.querySelector("#cx-name").focus(); return; }
        const e = { id: "cx-" + app.uid(), name, primary: el.querySelector("#cx-m").value, secondary: [], equipment: el.querySelector("#cx-e").value, type: el.querySelector("#cx-t").value, custom: true };
        store.exercise(e); indexCache = null; saved(e.id);
      };
    }

    // ---------- Routines ----------
    function routineEditor(r) {
      const draft = r ? JSON.parse(JSON.stringify(r)) : { id: "rt-" + app.uid(), name: "", exercises: [] };
      const draw = () => {
        const el = $("#sheet-body");
        el.innerHTML = head(r ? "Edit routine" : "New routine") + `
          <input type="text" id="rt-name" value="${esc(draft.name)}" placeholder="Routine name, e.g. Push day" aria-label="Routine name">
          <div class="results" style="max-height:48vh">${draft.exercises.map((re, i) => `<div class="rt-row">
            <div class="row spread"><strong>${esc(exDef(re.exId).name)}</strong><button class="x" type="button" data-rm="${i}" aria-label="Remove">×</button></div>
            <div class="row small" style="gap:8px">
              <label class="row" style="gap:4px">Sets <input type="number" inputmode="numeric" data-rs="${i}" value="${re.sets}" style="width:3.4rem;padding:4px 6px"></label>
              <label class="row" style="gap:4px">Reps <input type="number" inputmode="numeric" data-rlo="${i}" value="${re.range[0]}" style="width:3.2rem;padding:4px 6px">–<input type="number" inputmode="numeric" data-rhi="${i}" value="${re.range[1]}" style="width:3.2rem;padding:4px 6px"></label>
              <label class="row" style="gap:4px">Rest <select data-rr="${i}" style="width:auto;padding:4px 6px">${[0, 45, 60, 90, 120, 180, 240].map((s) => `<option value="${s}" ${s === re.rest ? "selected" : ""}>${s ? secOut(s) : "Off"}</option>`).join("")}</select></label>
            </div></div>`).join("") || `<p class="empty">No exercises yet.</p>`}</div>
          <button class="btn ghost wide" type="button" id="rt-add">+ Add exercises</button>
          <div class="row">${r ? `<button class="btn ghost" type="button" id="rt-del" style="color:var(--protein)">Delete</button>` : ""}<button class="btn" type="button" id="rt-save" style="flex:1">Save routine</button></div>`;
        const sync = () => {
          draft.name = el.querySelector("#rt-name").value;
          el.querySelectorAll("[data-rs]").forEach((x) => (draft.exercises[x.dataset.rs].sets = Math.max(1, Number(x.value) || 1)));
          el.querySelectorAll("[data-rlo]").forEach((x) => (draft.exercises[x.dataset.rlo].range[0] = Number(x.value) || 1));
          el.querySelectorAll("[data-rhi]").forEach((x) => (draft.exercises[x.dataset.rhi].range[1] = Math.max(draft.exercises[x.dataset.rhi].range[0], Number(x.value) || 1)));
          el.querySelectorAll("[data-rr]").forEach((x) => (draft.exercises[x.dataset.rr].rest = Number(x.value)));
        };
        el.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => { sync(); draft.exercises.splice(Number(b.dataset.rm), 1); draw(); }));
        el.querySelector("#rt-add").onclick = () => { sync(); picker((ids) => { for (const id of ids) draft.exercises.push({ exId: id, sets: 3, range: [8, 12], rest: 90 }); app.sheet("", draw); }); };
        el.querySelector("#rt-save").onclick = () => {
          sync();
          if (!draft.name.trim()) { el.querySelector("#rt-name").focus(); return; }
          if (!draft.exercises.length) { flash("Add at least one exercise."); return; }
          draft.name = draft.name.trim(); store.routine(draft); app.closeSheet(); app.render();
        };
        const del = el.querySelector("#rt-del"); if (del) del.onclick = () => { store.dropRoutine(draft.id); app.closeSheet(); app.render(); };
        el.querySelector("[data-close]").onclick = () => app.closeSheet();
      };
      app.sheet("", draw);
    }

    // ---------- Train home ----------
    let sub = { kind: "home" }, chartMetric = "e1rm";
    function homeView() {
      const idx = exIndex();
      const workouts = Object.values(S.workouts).sort((a, b) => b.start - a.start);
      const routines = Object.values(S.routines).sort((a, b) => a.name.localeCompare(b.name));
      const ms = W.muscleSets(S.workouts, idx);
      const muscleRows = Object.entries(ms).filter(([m]) => m !== "full body").sort((a, b) => b[1] - a[1]);
      const weeks = W.weeklyCounts(S.workouts);
      const thisWeek = weeks[weeks.length - 1];
      // Exercises you train most, with change in estimated strength.
      const freq = {};
      const since = Date.now() - 60 * 86400000;
      for (const w of workouts) if (w.start >= since) for (const ex of w.exercises) freq[ex.exId] = (freq[ex.exId] || 0) + 1;
      const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id]) => {
        const def = exDef(id), ser = W.series(def, S.workouts);
        const metric = def.type === "wr" ? "e1rm" : def.type === "du" ? "sec" : def.type === "cd" ? "km" : "reps";
        const first = ser[0], last = ser[ser.length - 1];
        const val = (p) => (p ? p[metric] : 0);
        const chg = first && last && val(first) ? Math.round(((val(last) - val(first)) / val(first)) * 100) : null;
        const shown = metric === "e1rm" ? `${wOut(val(last))} ${wu()}` : metric === "sec" ? secOut(val(last)) : metric === "km" ? `${val(last)} km` : `${val(last)} reps`;
        return { def, shown, chg, sessions: ser.length, label: metric === "e1rm" ? "est. 1RM" : metric === "reps" ? "best set" : "best" };
      });
      return `<div class="app" style="gap:14px">
        <section class="card">
          <div class="row spread"><h2>Train</h2><span class="small muted">${thisWeek} workout${thisWeek === 1 ? "" : "s"} this week</span></div>
          <button class="btn wide" type="button" id="tr-empty">Start empty workout</button>
        </section>
        <section class="card">
          <div class="row spread"><h2>Routines</h2><button class="btn ghost small" type="button" id="rt-new">New routine</button></div>
          ${routines.length ? routines.map((r) => `<div class="entry"><div><div class="nm">${esc(r.name)}</div><div class="sub">${esc(r.exercises.map((e) => exDef(e.exId).name.replace(/ \(.*\)$/, "")).slice(0, 4).join(", "))}${r.exercises.length > 4 ? ` +${r.exercises.length - 4}` : ""}</div></div>
            <button class="btn ghost small" type="button" data-rtedit="${esc(r.id)}">Edit</button><button class="btn small" type="button" data-rtstart="${esc(r.id)}">Start</button></div>`).join("")
            : `<p class="empty">Routines are workouts you repeat, like Push, Pull and Legs. Build one here, or save a finished workout as a routine.</p>`}
        </section>
        <section class="card">
          <div class="row spread"><h2>Strength</h2><button class="btn ghost small" type="button" id="ex-find">Find exercise</button></div>
          ${top.length ? top.map((x) => `<button type="button" class="result" data-exinfo="${esc(x.def.id)}"><span><span>${esc(x.def.name)}</span><br><span class="small muted">${x.sessions} session${x.sessions > 1 ? "s" : ""} · ${x.label}</span></span>
            <span style="text-align:right"><span class="num">${x.shown}</span><br>${x.chg != null && x.sessions > 1 ? `<span class="small" style="color:${x.chg > 0 ? "var(--good)" : x.chg < 0 ? "var(--warn)" : "var(--muted)"}">${x.chg > 0 ? "▲ " : x.chg < 0 ? "▼ " : ""}${Math.abs(x.chg)}%</span>` : ""}</span></button>`).join("")
            : `<p class="empty">Your most-trained lifts appear here with how much stronger you're getting.</p>`}
        </section>
        <section class="card">
          <div class="row spread"><h2>Sets per muscle</h2><span class="small muted">last 7 days</span></div>
          ${muscleRows.length ? `<div class="mbars">${muscleRows.map(([m, n]) => `<div class="mbar"><span>${cap(m)}</span><div class="track"><b style="width:${Math.min(100, (n / 20) * 100)}%;background:${n >= 10 ? "var(--good)" : "var(--ink)"}"></b><i style="left:50%"></i></div><span class="num">${Math.round(n * 10) / 10}</span></div>`).join("")}</div>
            <p class="small muted" style="margin:0">10–20 hard sets a week per muscle is the usual range for growth. The mark shows 10. Secondary muscles count half a set.</p>`
            : `<p class="empty">Log a workout to see how many sets each muscle gets.</p>`}
        </section>
        <section class="card">
          <h2>History</h2>
          ${workouts.length ? workouts.slice(0, 15).map((w) => { const s = W.summary(w, idx, S.workouts); return `<button type="button" class="result" data-wk="${esc(w.id)}"><span><span>${esc(w.name)}</span><br><span class="small muted">${fmtDate(w.date)} · ${fmtDur(s.durationMin)} · ${s.sets} sets</span></span><span class="small" style="text-align:right"><span class="num">${fmtVol(s.volume)}</span>${s.prs.length ? `<br><span class="prb">${s.prs.length} PR</span>` : ""}</span></button>`; }).join("")
            : `<p class="empty">Finished workouts appear here.</p>`}
        </section>
      </div>`;
    }
    function bindHome() {
      const v = $("#view");
      $("#tr-empty").onclick = () => startWorkout({});
      $("#rt-new").onclick = () => routineEditor(null);
      $("#ex-find").onclick = () => picker((ids) => openExercise(ids[0]), { single: true });
      v.querySelectorAll("[data-rtedit]").forEach((b) => (b.onclick = () => routineEditor(S.routines[b.dataset.rtedit])));
      v.querySelectorAll("[data-rtstart]").forEach((b) => (b.onclick = () => { const r = S.routines[b.dataset.rtstart]; startWorkout({ name: r.name, routineId: r.id, exercises: r.exercises.map(exFromRoutine) }); }));
      v.querySelectorAll("[data-exinfo]").forEach((b) => (b.onclick = () => openExercise(b.dataset.exinfo)));
      v.querySelectorAll("[data-wk]").forEach((b) => (b.onclick = () => workoutDetail(S.workouts[b.dataset.wk])));
    }

    function workoutDetail(w) {
      const idx = exIndex(), s = W.summary(w, idx, S.workouts);
      const prKey = new Set(s.prs.map((p) => p.exercise));
      sheet(head(esc(w.name)) + `<p class="small muted" style="margin:0">${fmtDate(w.date, { weekday: "long", day: "numeric", month: "long" })} · ${new Date(w.start).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · ${fmtDur(s.durationMin)} · ${fmtVol(s.volume)}</p>
        <div class="results" style="max-height:52vh">${w.exercises.map((ex) => { const def = exDef(ex.exId); return `<div class="rt-row"><strong>${esc(def.name)}</strong>${prKey.has(def.name) ? ` <span class="prb">PR</span>` : ""}
          <div class="small">${ex.sets.map((st, i) => `<div class="row spread"><span class="muted">${st.type === "n" ? "Set " + (i + 1) : W.SET_TYPES[st.type]}</span><span class="num">${esc(fmtSet(st, def.type))}</span></div>`).join("")}</div>${ex.note ? `<div class="small muted">${esc(ex.note)}</div>` : ""}</div>`; }).join("")}</div>
        <div class="row"><button class="btn ghost small" type="button" id="wd-del" style="color:var(--protein)">Delete</button><button class="btn ghost small" type="button" id="wd-rt">Save as routine</button><button class="btn small" type="button" id="wd-again" style="flex:1">Repeat workout</button></div>`, (el) => {
        el.querySelector("#wd-del").onclick = () => { el.querySelector("#wd-del").outerHTML = `<button class="btn small" type="button" id="wd-del2" style="background:var(--protein);color:#fff">Tap again to delete</button>`; el.querySelector("#wd-del2").onclick = () => { store.dropWorkout(w.id); app.closeSheet(); app.render(); }; };
        el.querySelector("#wd-rt").onclick = () => { routineFromWorkout(w); app.closeSheet(); flash(`Saved "${w.name}" as a routine.`, "good"); app.render(); };
        el.querySelector("#wd-again").onclick = () => { app.closeSheet(); startWorkout({ name: w.name, routineId: w.routineId, exercises: w.exercises.map((ex) => exFromRoutine({ exId: ex.exId, sets: ex.sets.filter((x) => x.type !== "w").length, range: ex.range, rest: ex.rest })) }); };
      });
    }

    // ---------- Exercise detail ----------
    function openExercise(id) { app.closeSheet(); sub = { kind: "exercise", id }; chartMetric = null; app.go("train"); window.scrollTo(0, 0); }
    function exerciseView() {
      const def = exDef(sub.id), b = W.bests(def.id, S.workouts), ser = W.series(def, S.workouts);
      const metrics = def.type === "wr" ? [["e1rm", "Est. 1RM"], ["topKg", "Heaviest"], ["volume", "Volume"]]
        : def.type === "bw" ? [["reps", "Best set"], ["topKg", "Added weight"]]
        : def.type === "as" ? [["reps", "Best set"]]
        : def.type === "du" ? [["sec", "Longest"]] : [["km", "Distance"], ["sec", "Time"]];
      chartMetric = metrics.some((m) => m[0] === chartMetric) ? chartMetric : metrics[0][0];
      const isW = ["e1rm", "topKg", "volume"].includes(chartMetric);
      const pts = ser.map((p) => ({ date: p.date, v: isW ? Number(wOut(p[chartMetric])) : p[chartMetric] })).filter((p) => p.v > 0);
      const hist = W.sessions(def.id, S.workouts).reverse().slice(0, 12);
      const tiles = def.type === "wr"
        ? [["Est. 1RM", b.e1rm ? `${wOut(b.e1rm.value)}` : "–", wu()], ["Heaviest", b.kg ? `${wOut(b.kg.kg)}` : "–", b.kg ? `× ${b.kg.reps}` : ""], ["Best set", b.volume ? `${wOut(b.volume.kg)}×${b.volume.reps}` : "–", ""]]
        : def.type === "du" ? [["Longest", b.duration ? secOut(b.duration.sec) : "–", ""]]
        : def.type === "cd" ? [["Furthest", b.distance ? b.distance.km + " km" : "–", ""]]
        : [["Most reps", b.reps ? b.reps.reps : "–", ""], ["Heaviest", b.kg ? "+" + wOut(b.kg.kg) : "–", b.kg ? wu() : ""]];
      return `<div class="app" style="gap:14px">
        <button class="link" type="button" id="ex-back" style="justify-self:start">‹ Train</button>
        <section class="card">
          <div><h2>${esc(def.name)}</h2><p class="small muted" style="margin:2px 0 0">${cap(def.primary)}${def.secondary.length ? " · also " + def.secondary.join(", ") : ""} · ${esc(def.equipment)}</p></div>
          <div class="stats">${tiles.map(([k, v, s]) => `<div class="stat"><span class="k">${k}</span><span class="v">${v}</span><span class="s">${s}</span></div>`).join("")}</div>
          ${metrics.length > 1 ? `<div class="seg" id="ex-metric">${metrics.map(([k, l]) => `<button type="button" data-v="${k}" aria-pressed="${k === chartMetric}">${l}</button>`).join("")}</div>` : ""}
          <div class="chart-wrap">${lineChart(pts, isW ? wu() : chartMetric === "sec" ? "s" : chartMetric === "km" ? "km" : "reps", chartMetric === "sec")}</div>
          ${def.type === "wr" ? `<p class="small muted" style="margin:0">Estimated 1RM uses the Epley formula on your best working set each session, so you can see strength rising without testing a true max.</p>` : ""}
        </section>
        <section class="card"><h3>History</h3>${hist.length ? hist.map((h) => `<div class="entry" style="grid-template-columns:minmax(0,1fr) auto"><span>${fmtDate(h.date)}</span><span class="num small" style="text-align:right">${h.sets.map((st) => esc(fmtSet(st, def.type))).join("<br>")}</span></div>`).join("") : `<p class="empty">You haven't done this exercise yet.</p>`}</section>
        <button class="btn wide" type="button" id="ex-start">${S.active ? "Add to current workout" : "Start a workout with this"}</button>
      </div>`;
    }
    function bindExercise() {
      $("#ex-back").onclick = () => { sub = { kind: "home" }; app.render(); };
      const m = $("#ex-metric"); if (m) m.onclick = (e) => { const b = e.target.closest("button"); if (b) { chartMetric = b.dataset.v; app.render(); } };
      $("#ex-start").onclick = () => {
        const ex = exFromRoutine({ exId: sub.id });
        sub = { kind: "home" };
        if (S.active) { S.active.exercises.push(ex); saveActive(true); app.render(); } else startWorkout({ exercises: [ex] });
      };
      bindChart();
    }

    // A small line chart over dates, styled like the weight chart.
    let chartPts = [];
    function lineChart(pts, unitLabel, asTime) {
      if (pts.length < 2) return `<p class="empty">${pts.length ? "One session so far. The chart appears after your second." : "No sessions yet."}</p>`;
      const Wd = 380, H = 190, L = 40, R = 10, T = 10, B = 24;
      let lo = Math.min(...pts.map((p) => p.v)), hi = Math.max(...pts.map((p) => p.v));
      const pad = Math.max((hi - lo) * 0.15, hi * 0.03, 1); lo = Math.max(0, lo - pad); hi += pad;
      const step = [0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 250, 500, 1000, 2500, 5000].find((s) => (hi - lo) / s <= 5) || 10000;
      const x = (i) => L + (i / (pts.length - 1)) * (Wd - L - R);
      const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
      let grid = "";
      for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) grid += `<line x1="${L}" x2="${Wd - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)" font-family="var(--font-num)">${asTime ? secOut(v) : Number(v.toFixed(1))}</text>`;
      const d = (s) => fmtDate(s, { day: "numeric", month: "short" });
      const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
      chartPts = pts.map((p, i) => ({ ...p, cx: x(i), cy: y(p.v), unitLabel, asTime }));
      return `<svg viewBox="0 0 ${Wd} ${H}" role="img" aria-label="Progress chart">${grid}
        <text x="${L}" y="${H - 6}" font-size="11" fill="var(--muted)">${d(pts[0].date)}</text><text x="${Wd - R}" y="${H - 6}" text-anchor="end" font-size="11" fill="var(--muted)">${d(pts[pts.length - 1].date)}</text>
        <path d="${line}" fill="none" stroke="var(--protein)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        ${pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="${i === pts.length - 1 ? 4.5 : 3}" fill="var(--protein)" stroke="var(--card)" stroke-width="2"/>`).join("")}
        <line id="lc-cross" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="var(--muted)" stroke-dasharray="3 3" visibility="hidden"/>
        <rect x="${L}" y="${T}" width="${Wd - L - R}" height="${H - T - B}" fill="transparent" id="lc-hit"/></svg><div class="tip" id="lc-tip" hidden></div>`;
    }
    function bindChart() {
      const hit = $("#lc-hit"); if (!hit) return;
      const svg = hit.ownerSVGElement, tip = $("#lc-tip"), cross = $("#lc-cross");
      const move = (ev) => {
        const r = svg.getBoundingClientRect(), sx = ((ev.clientX - r.left) / r.width) * 380;
        let best = chartPts[0];
        for (const p of chartPts) if (Math.abs(p.cx - sx) < Math.abs(best.cx - sx)) best = p;
        cross.setAttribute("x1", best.cx); cross.setAttribute("x2", best.cx); cross.setAttribute("visibility", "visible");
        tip.hidden = false;
        tip.innerHTML = `<strong>${fmtDate(best.date)}</strong><br><span class="num">${best.asTime ? secOut(best.v) : best.v + " " + best.unitLabel}</span>`;
        const px = (best.cx / 380) * r.width, py = (best.cy / 190) * r.height;
        tip.style.left = Math.max(0, Math.min(r.width - tip.offsetWidth, px - tip.offsetWidth / 2)) + "px";
        tip.style.top = Math.max(0, py - tip.offsetHeight - 12) + "px";
      };
      hit.addEventListener("pointermove", move); hit.addEventListener("pointerdown", move);
      hit.addEventListener("pointerleave", () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); });
    }

    // ---------- Progress photos ----------
    // Claude version: stored as artifact assets. Installed app: IndexedDB on the phone.
    const urls = {};
    let idbP = null;
    function idb() {
      if (!idbP) idbP = new Promise((res, rej) => {
        const r = indexedDB.open("fuel-log", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("photos");
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      return idbP;
    }
    const idbDo = (mode, fn) => idb().then((db) => new Promise((res, rej) => { const tx = db.transaction("photos", mode); const req = fn(tx.objectStore("photos")); tx.oncomplete = () => res(req && req.result); tx.onerror = () => rej(tx.error); }));
    async function photoSrc(p) {
      if (p.assetId) return "/_blob/" + p.assetId;
      if (urls[p.id]) return urls[p.id];
      const blob = await idbDo("readonly", (st) => st.get(p.id)).catch(() => null);
      if (!blob) return null;
      return (urls[p.id] = URL.createObjectURL(blob));
    }
    async function savePhoto(file, date, pose) {
      const canvas = await app.shrink(file, 1600);
      const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85));
      const meta = { id: "ph-" + app.uid(), date, pose, added: Date.now() };
      const assets = app.assets();
      if (assets) {
        try { meta.assetId = (await assets.upload(blob)).id; }
        catch (e) { if (e && e.code === "quota_exceeded") throw new Error("Photo storage is full. Delete some older photos first."); }
      }
      if (!meta.assetId) await idbDo("readwrite", (st) => st.put(blob, meta.id));
      store.photo(meta);
      return meta;
    }
    async function deletePhoto(p) {
      const assets = app.assets();
      if (p.assetId && assets) { try { await assets.delete(p.assetId); } catch (e) {} }
      else await idbDo("readwrite", (st) => st.delete(p.id)).catch(() => {});
      if (urls[p.id]) { URL.revokeObjectURL(urls[p.id]); delete urls[p.id]; }
      store.dropPhoto(p.id);
    }

    let cmp = null; // {a, b, pose}
    function photosCard() {
      const photos = Object.values(S.photos).sort((a, b) => b.date.localeCompare(a.date) || b.added - a.added);
      const dates = [...new Set(photos.map((p) => p.date))];
      const tr = app.trend();
      const wAt = (d) => { let v = null; for (const p of tr) if (p.date <= d) v = p.trend; return v; };
      let compare = "";
      if (dates.length >= 2) {
        cmp = cmp || { a: dates[dates.length - 1], b: dates[0], pose: "front" };
        const pick = (d) => photos.find((p) => p.date === d && p.pose === cmp.pose) || photos.find((p) => p.date === d);
        const pa = pick(cmp.a), pb = pick(cmp.b);
        const wa = wAt(cmp.a), wb = wAt(cmp.b);
        const opts = (sel) => dates.map((d) => `<option value="${d}" ${d === sel ? "selected" : ""}>${fmtDate(d, { day: "numeric", month: "short", year: "numeric" })}</option>`).join("");
        compare = `<div class="cmp">
          <div class="row" style="gap:8px"><select id="cmp-a" aria-label="Earlier photo date">${opts(cmp.a)}</select><select id="cmp-b" aria-label="Later photo date">${opts(cmp.b)}</select></div>
          <div class="seg" id="cmp-pose">${["front", "side", "back"].map((p) => `<button type="button" data-v="${p}" aria-pressed="${cmp.pose === p}">${cap(p)}</button>`).join("")}</div>
          <div class="cmp-pair">${[[pa, cmp.a, wa], [pb, cmp.b, wb]].map(([p, d, w]) => `<figure>${p ? `<img data-ph="${esc(p.id)}" alt="${cap(p.pose)} photo, ${fmtDate(d)}">` : `<div class="ph-empty">No photo</div>`}<figcaption>${fmtDate(d, { day: "numeric", month: "short" })}${w ? ` · ${app.fmtW(w)} ${wu()}` : ""}</figcaption></figure>`).join("")}</div>
          ${wa && wb ? `<p class="small muted" style="margin:0;text-align:center">${app.daysBetween(cmp.a, cmp.b)} days apart · trend weight ${wb - wa >= 0 ? "+" : "−"}${app.fmtW(Math.abs(wb - wa))} ${wu()}</p>` : ""}
        </div>`;
      }
      return `<section class="card">
        <div class="row spread"><h2>Progress photos</h2><label class="btn small" style="position:relative;overflow:hidden">Add photo<input type="file" id="ph-file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label></div>
        ${compare}
        ${photos.length ? `<div class="ph-grid">${photos.map((p) => `<button type="button" class="ph" data-phopen="${esc(p.id)}"><img data-ph="${esc(p.id)}" alt="${cap(p.pose)} photo, ${fmtDate(p.date)}" loading="lazy"><span>${fmtDate(p.date, { day: "numeric", month: "short" })} · ${cap(p.pose)}</span></button>`).join("")}</div>`
          : `<p class="empty">Take front, side and back photos every two to four weeks, in the same light and spot. When you're building muscle, photos show changes the scale can't.</p>`}
        <p class="small muted" style="margin:0">${app.assets() ? "Photos are saved privately with this page in your Claude account." : "Photos are stored on this device only and aren't included in the backup."}</p>
      </section>`;
    }
    function bindPhotos() {
      document.querySelectorAll("img[data-ph]").forEach(async (img) => {
        const p = S.photos[img.dataset.ph]; if (!p) return;
        const src = await photoSrc(p);
        if (src) img.src = src; else img.replaceWith(Object.assign(document.createElement("div"), { className: "ph-empty", textContent: "Not on this device" }));
      });
      const f = $("#ph-file");
      if (f) f.onchange = () => {
        const file = f.files[0]; if (!file) return;
        let pose = "front";
        sheet(head("Add progress photo") + `<img id="ph-prev" alt="Selected photo" style="max-height:38vh;object-fit:contain;border-radius:8px;background:var(--chalk)">
          <div class="seg" id="ph-pose">${["front", "side", "back"].map((p) => `<button type="button" data-v="${p}" aria-pressed="${p === pose}">${cap(p)}</button>`).join("")}</div>
          <label class="field"><span>Date</span><input type="date" id="ph-date" value="${app.today()}" max="${app.today()}"></label>
          <button class="btn wide" type="button" id="ph-save">Save photo</button><div id="ph-status"></div>`, (el) => {
          const url = URL.createObjectURL(file); el.querySelector("#ph-prev").src = url;
          el.querySelector("#ph-pose").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; pose = b.dataset.v; el.querySelectorAll("#ph-pose button").forEach((x) => x.setAttribute("aria-pressed", x === b)); };
          el.querySelector("#ph-save").onclick = async () => {
            const btn = el.querySelector("#ph-save"); btn.disabled = true; btn.textContent = "Saving…";
            try { await savePhoto(file, el.querySelector("#ph-date").value || app.today(), pose); URL.revokeObjectURL(url); app.closeSheet(); cmp = null; app.render(); }
            catch (e) { btn.disabled = false; btn.textContent = "Save photo"; el.querySelector("#ph-status").innerHTML = `<div class="status warn">${esc(e.message || "Couldn't save the photo. Try again.")}</div>`; }
          };
        });
        f.value = "";
      };
      const sel = (id, k) => { const s = $(id); if (s) s.onchange = () => { cmp[k] = s.value; app.render(); }; };
      sel("#cmp-a", "a"); sel("#cmp-b", "b");
      const cp = $("#cmp-pose"); if (cp) cp.onclick = (e) => { const b = e.target.closest("button"); if (b) { cmp.pose = b.dataset.v; app.render(); } };
      document.querySelectorAll("[data-phopen]").forEach((b) => (b.onclick = async () => {
        const p = S.photos[b.dataset.phopen], src = await photoSrc(p);
        sheet(head(`${cap(p.pose)} · ${fmtDate(p.date, { day: "numeric", month: "long", year: "numeric" })}`) + `${src ? `<img src="${src}" alt="${cap(p.pose)} photo" style="max-height:62vh;object-fit:contain;border-radius:8px">` : `<div class="ph-empty">Not on this device</div>`}
          <button class="btn ghost" type="button" id="ph-del" style="color:var(--protein)">Delete photo</button>`, (el) => {
          el.querySelector("#ph-del").onclick = () => { el.querySelector("#ph-del").outerHTML = `<button class="btn" type="button" id="ph-del2" style="background:var(--protein);color:#fff">Tap again to delete</button>`; el.querySelector("#ph-del2").onclick = async () => { await deletePhoto(p); app.closeSheet(); cmp = null; app.render(); }; };
        });
      }));
    }

    // ---------- Public ----------
    return {
      view() { return S.active && sub.kind !== "exercise" ? activeView() : sub.kind === "exercise" ? exerciseView() : homeView(); },
      bind() { if (S.active && sub.kind !== "exercise") bindActive(); else if (sub.kind === "exercise") bindExercise(); else bindHome(); },
      banner() {
        return S.active ? `<button class="banner" type="button" id="wk-resume"><span><strong>Workout in progress</strong><br><span class="small"><span class="num" id="wk-banner-time">${clock(Date.now() - S.active.start)}</span> · ${esc(S.active.name)}</span></span><span aria-hidden="true">›</span></button>` : "";
      },
      bindBanner() { const b = $("#wk-resume"); if (b) b.onclick = () => { sub = { kind: "home" }; app.go("train"); window.scrollTo(0, 0); }; },
      photosCard, bindPhotos,
      weekCount() { const w = W.weeklyCounts(S.workouts); return w[w.length - 1]; },
      reset() { sub = { kind: "home" }; },
    };
  };
})();
