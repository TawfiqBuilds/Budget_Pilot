import React, { useState, useEffect, useMemo, useRef } from "react";
import { storage } from "./storage";
import { supabase } from "./supabaseClient";
import { Plus, Trash2, Info, ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
  PieChart, Pie,
} from "recharts";

const DEFAULT_CATEGORIES = [
  { id: "rent", label: "Rent (incl. electricity)", amount: 11000, type: "expense" },
  { id: "emi", label: "EMI", amount: 21391, type: "expense" },
  { id: "phone", label: "Phone (own + mom, amortized)", amount: 500, type: "expense" },
  { id: "insurance", label: "Insurance (amortized)", amount: 425, type: "expense" },
  { id: "food", label: "Food bucket", amount: 2745, type: "expense" },
  { id: "personalCare", label: "Personal care bucket", amount: 2040, type: "expense" },
  { id: "eatingOut", label: "Eating out", amount: 650, type: "expense" },
  { id: "ef", label: "Emergency fund", amount: 4000, type: "saving" },
  { id: "clothes", label: "Clothes / personal buffer", amount: 1500, type: "expense" },
  { id: "sip", label: "SIP investing", amount: 1000, type: "saving" },
];

const DEFAULT_FOOD_REFERENCE = [
  { id: "ref-eggs", name: "Eggs", amount: 600 },
  { id: "ref-badam", name: "Badam (450/50 days, amortized)", amount: 270 },
  { id: "ref-walnuts", name: "Walnuts", amount: 350 },
  { id: "ref-seeds", name: "Seeds", amount: 250 },
  { id: "ref-milk", name: "Milk", amount: 525 },
  { id: "ref-oats", name: "Oats", amount: 500 },
  { id: "ref-dates", name: "Dates", amount: 250 },
];
const DEFAULT_PERSONAL_REFERENCE = [
  { id: "ref-facewash", name: "Face Wash", amount: 210 },
  { id: "ref-sunscreen", name: "Sunscreen", amount: 300 },
  { id: "ref-transport", name: "Transport", amount: 500 },
  { id: "ref-upskilling", name: "Upskilling", amount: 500 },
  { id: "ref-fab", name: "Fab x2", amount: 200 },
  { id: "ref-mysore", name: "Mysore", amount: 70 },
  { id: "ref-toothpaste", name: "Toothpaste", amount: 50 },
  { id: "ref-shampoo", name: "Shampoo", amount: 60 },
  { id: "ref-oil", name: "Oil", amount: 50 },
  { id: "ref-perfume", name: "Perfume", amount: 100 },
];

const PALETTE = ["#B9832A", "#5C7A4F", "#A24B3B", "#5B6B79", "#7A5C79", "#C9A227", "#4F7A72", "#8C5A3C", "#6B6656", "#8A7A9B"];
const FOOD_COLOR = "#B9832A";
const PERSONAL_COLOR = "#7A5C79";

function monthKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function shiftMonth(key, delta) { const [y, m] = key.split("-").map(Number); return monthKey(new Date(y, m - 1 + delta, 1)); }
function prevMonthKey(key) { return shiftMonth(key, -1); }
function monthLabel(key) { const [y, m] = key.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" }); }
function fmt(n) { return "₹" + Math.round(n).toLocaleString("en-IN"); }
function fmtShort(n) { if (Math.abs(n) >= 1000) return "₹" + (n / 1000).toFixed(1).replace(/\.0$/, "") + "k"; return "₹" + Math.round(n); }
function fmtDelta(n) { const sign = n > 0 ? "+" : n < 0 ? "\u2212" : ""; return sign + "₹" + Math.abs(Math.round(n)).toLocaleString("en-IN"); }
function uid() { return Math.random().toString(36).slice(2, 10); }

function getMonthsInQuarter(key) {
  const [y, m] = key.split("-").map(Number);
  const qStart = Math.floor((m - 1) / 3) * 3 + 1;
  return [0, 1, 2].map((i) => `${y}-${String(qStart + i).padStart(2, "0")}`);
}
function getMonthsInYear(key) {
  const y = key.split("-")[0];
  return Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, "0")}`);
}

function buildMonthlySeries(byMonth, n = 12) {
  const now = new Date();
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKey(d);
    out.push({ key, label: d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }), food: byMonth[key]?.food || 0, personal: byMonth[key]?.personal || 0 });
  }
  return out;
}
function buildQuarterlySeries(byMonth) {
  const map = {};
  Object.entries(byMonth).forEach(([k, v]) => {
    const [y, m] = k.split("-").map(Number);
    const q = Math.floor((m - 1) / 3) + 1;
    const qk = `${y}-Q${q}`;
    if (!map[qk]) map[qk] = { food: 0, personal: 0 };
    map[qk].food += v.food || 0;
    map[qk].personal += v.personal || 0;
  });
  return Object.keys(map).sort().map((k) => ({ key: k, label: k.replace("-", " "), food: map[k].food, personal: map[k].personal }));
}
function buildYearlySeries(byMonth) {
  const map = {};
  Object.entries(byMonth).forEach(([k, v]) => {
    const y = k.split("-")[0];
    if (!map[y]) map[y] = { food: 0, personal: 0 };
    map[y].food += v.food || 0;
    map[y].personal += v.personal || 0;
  });
  return Object.keys(map).sort().map((k) => ({ key: k, label: k, food: map[k].food, personal: map[k].personal }));
}
function trendOf(series) {
  const withData = series.filter((s) => s.food + s.personal > 0);
  if (withData.length === 0) return null;
  const totalOf = (s) => s.food + s.personal;
  const latest = withData[withData.length - 1];
  const prev = withData.length > 1 ? withData[withData.length - 2] : null;
  const pct = prev ? ((totalOf(latest) - totalOf(prev)) / totalOf(prev)) * 100 : null;
  const avg = withData.reduce((s, x) => s + totalOf(x), 0) / withData.length;
  return { pct, avg };
}
function buildCumulativeSeries(actualsByMonth, catId, n = 12) {
  const now = new Date();
  const out = [];
  let running = 0;
  const allKeys = Object.keys(actualsByMonth).sort();
  const windowStart = monthKey(new Date(now.getFullYear(), now.getMonth() - (n - 1), 1));
  for (const k of allKeys) { if (k < windowStart) running += actualsByMonth[k]?.[catId] || 0; }
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKey(d);
    running += actualsByMonth[key]?.[catId] || 0;
    out.push({ key, label: d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }), value: running });
  }
  return out;
}

function SingleBarChart({ data, color }) {
  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#D3CBB5" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6B6656", fontFamily: "monospace" }} axisLine={{ stroke: "#D3CBB5" }} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "#6B6656", fontFamily: "monospace" }} axisLine={false} tickLine={false} tickFormatter={fmtShort} width={44} />
        <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontFamily: "monospace", fontSize: 12, border: "1px solid #D3CBB5", borderRadius: 4 }} />
        <Bar dataKey="value" radius={[3, 3, 0, 0]}>{data.map((d, i) => <Cell key={i} fill={color} />)}</Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function DualBarChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#D3CBB5" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6B6656", fontFamily: "monospace" }} axisLine={{ stroke: "#D3CBB5" }} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "#6B6656", fontFamily: "monospace" }} axisLine={false} tickLine={false} tickFormatter={fmtShort} width={44} />
        <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontFamily: "monospace", fontSize: 12, border: "1px solid #D3CBB5", borderRadius: 4 }} />
        <Legend wrapperStyle={{ fontSize: 11, fontFamily: "monospace" }} />
        <Bar dataKey="food" name="Food" fill={FOOD_COLOR} radius={[3, 3, 0, 0]} />
        <Bar dataKey="personal" name="Personal care" fill={PERSONAL_COLOR} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const PILL_BASE = { border: "1px solid var(--line)", background: "transparent", padding: "4px 10px", fontSize: 11, borderRadius: 20, cursor: "pointer", fontFamily: "var(--font-mono)" };

function BucketBlock({ label, catId, limit, spent, isCurrentReal, dayOfMonth, daysInMonth, rollingAvg, pastCount, monthLabelText, color }) {
  const expectedPace = limit * (dayOfMonth / daysInMonth);
  let status = "ON PACE", statusColor = "var(--olive)";
  if (isCurrentReal && limit > 0) {
    if (spent > expectedPace * 1.15) { status = "OVER PACE"; statusColor = "var(--clay)"; }
    else if (spent > expectedPace * 1.0) { status = "WATCH"; statusColor = "var(--turmeric)"; }
  } else if (!isCurrentReal && limit > 0) {
    status = spent > limit ? "OVER LIMIT" : "UNDER LIMIT";
    statusColor = spent > limit ? "var(--clay)" : "var(--olive)";
  }
  const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
  return (
    <div className="card" style={{ flex: 1, minWidth: 240 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8 }}>
        <div>
          <div className="section-title" style={{ margin: 0 }}>{label}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, lineHeight: 1.3 }}>
            {fmt(spent)}<span style={{ fontSize: 13, color: "var(--ink-soft)", fontWeight: 400 }}> / {fmt(limit)}</span>
          </div>
        </div>
        <span className="stamp" style={{ color: statusColor, fontSize: 9.5, padding: "3px 7px" }}>{status}</span>
      </div>
      <div style={{ height: 8, background: "var(--line)", borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: statusColor, transition: "width 0.4s ease" }} />
      </div>
      {isCurrentReal ? (
        <div style={{ fontSize: 10.5, color: "var(--ink-soft)", fontFamily: "var(--font-mono)" }}>Day {dayOfMonth}/{daysInMonth} · pace {fmt(expectedPace)}</div>
      ) : (
        <div style={{ fontSize: 10.5, color: "var(--ink-soft)", fontFamily: "var(--font-mono)" }}>Closed month</div>
      )}
      {rollingAvg !== null && (
        <div style={{ marginTop: 6, fontSize: 11, color: "var(--ink-soft)" }}>{pastCount}-mo avg: <strong style={{ color: "var(--ink)" }}>{fmt(rollingAvg)}</strong></div>
      )}
    </div>
  );
}

export default function BudgetLedger({ user }) {
  const [income, setIncome] = useState(45632);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [purchases, setPurchases] = useState([]);
  const [foodReference, setFoodReference] = useState(DEFAULT_FOOD_REFERENCE);
  const [personalReference, setPersonalReference] = useState(DEFAULT_PERSONAL_REFERENCE);
  const [actuals, setActuals] = useState({});
  const [notes, setNotes] = useState({});
  const [showFoodRef, setShowFoodRef] = useState(false);
  const [showPersonalRef, setShowPersonalRef] = useState(false);
  const [refName, setRefName] = useState({ food: "", personal: "" });
  const [refAmount, setRefAmount] = useState({ food: "", personal: "" });
  const [catName, setCatName] = useState("");
  const [catAmount, setCatAmount] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [purchaseCategory, setPurchaseCategory] = useState("food");
  const [saveNote, setSaveNote] = useState("");
  const [pieScope, setPieScope] = useState("month");
  const saveTimer = useRef(null);
  const noteSaveTimers = useRef({});

  const realCurrentKey = monthKey(new Date());
  const [selectedMonthKey, setSelectedMonthKey] = useState(realCurrentKey);
  const isCurrentReal = selectedMonthKey === realCurrentKey;

  useEffect(() => {
    (async () => {
      try { const inc = await storage.get("budget-income"); if (inc && inc.value) setIncome(JSON.parse(inc.value)); } catch (e) {}
      try { const c = await storage.get("budget-categories-list"); if (c && c.value) setCategories(JSON.parse(c.value)); } catch (e) {}
      try { const p = await storage.get("food-purchases"); if (p && p.value) setPurchases(JSON.parse(p.value)); } catch (e) {}
      try { const r = await storage.get("food-bucket-reference"); if (r && r.value) setFoodReference(JSON.parse(r.value)); } catch (e) {}
      try { const r2 = await storage.get("personal-bucket-reference"); if (r2 && r2.value) setPersonalReference(JSON.parse(r2.value)); } catch (e) {}
      try { const a = await storage.get("category-actuals"); if (a && a.value) setActuals(JSON.parse(a.value)); } catch (e) {}
      try { const n = await storage.get("category-notes"); if (n && n.value) setNotes(JSON.parse(n.value)); } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  function flash(msg) { setSaveNote(msg); clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => setSaveNote(""), 1400); }

  async function persistIncome(next) { setIncome(next); try { await storage.set("budget-income", JSON.stringify(next)); flash("Saved"); } catch (e) { flash("Save failed"); } }
  async function persistCategories(next) { setCategories(next); try { await storage.set("budget-categories-list", JSON.stringify(next)); flash("Saved"); } catch (e) { flash("Save failed"); } }
  async function persistPurchases(next) { setPurchases(next); try { await storage.set("food-purchases", JSON.stringify(next)); flash("Saved"); } catch (e) { flash("Save failed"); } }
  async function persistFoodRef(next) { setFoodReference(next); try { await storage.set("food-bucket-reference", JSON.stringify(next)); flash("Saved"); } catch (e) { flash("Save failed"); } }
  async function persistPersonalRef(next) { setPersonalReference(next); try { await storage.set("personal-bucket-reference", JSON.stringify(next)); flash("Saved"); } catch (e) { flash("Save failed"); } }
  async function persistActuals(next) { setActuals(next); try { await storage.set("category-actuals", JSON.stringify(next)); flash("Saved"); } catch (e) { flash("Save failed"); } }
  async function persistNotes(next) { try { await storage.set("category-notes", JSON.stringify(next)); flash("Saved"); } catch (e) { flash("Save failed"); } }

  function updateCatAmount(id, val) { const num = val === "" ? 0 : Number(val); if (Number.isNaN(num)) return; persistCategories(categories.map((c) => (c.id === id ? { ...c, amount: num } : c))); }
  function updateCatLabel(id, val) { persistCategories(categories.map((c) => (c.id === id ? { ...c, label: val } : c))); }
  function removeCategory(id) { persistCategories(categories.filter((c) => c.id !== id)); }
  function addCategory() {
    const amt = Number(catAmount);
    if (!catName.trim() || !amt || amt <= 0) return;
    persistCategories([...categories, { id: uid(), label: catName.trim(), amount: amt, type: "expense" }]);
    setCatName(""); setCatAmount("");
  }

  function updateRefAmount(bucket, id, val) {
    const num = val === "" ? 0 : Number(val);
    if (Number.isNaN(num)) return;
    if (bucket === "food") persistFoodRef(foodReference.map((r) => (r.id === id ? { ...r, amount: num } : r)));
    else persistPersonalRef(personalReference.map((r) => (r.id === id ? { ...r, amount: num } : r)));
  }
  function removeRefItem(bucket, id) {
    if (bucket === "food") persistFoodRef(foodReference.filter((r) => r.id !== id));
    else persistPersonalRef(personalReference.filter((r) => r.id !== id));
  }
  function addRefItem(bucket) {
    const amt = Number(refAmount[bucket]);
    const nm = refName[bucket];
    if (!nm.trim() || !amt || amt <= 0) return;
    const entry = { id: uid(), name: nm.trim(), amount: amt };
    if (bucket === "food") persistFoodRef([...foodReference, entry]);
    else persistPersonalRef([...personalReference, entry]);
    setRefName({ ...refName, [bucket]: "" });
    setRefAmount({ ...refAmount, [bucket]: "" });
  }

  function addPurchase() {
    const amt = Number(amount);
    if (!name.trim() || !amt || amt <= 0) return;
    const entry = { id: uid(), name: name.trim(), amount: amt, date: new Date().toISOString(), category: purchaseCategory };
    persistPurchases([entry, ...purchases]);
    setName(""); setAmount("");
  }
  function removePurchase(id) { persistPurchases(purchases.filter((p) => p.id !== id)); }

  const byMonth = useMemo(() => {
    const map = {};
    for (const p of purchases) {
      const k = monthKey(new Date(p.date));
      if (!map[k]) map[k] = { food: 0, personal: 0 };
      if (p.category === "personal") map[k].personal += p.amount;
      else map[k].food += p.amount;
    }
    return map;
  }, [purchases]);

  const foodCat = categories.find((c) => c.id === "food");
  const personalCat = categories.find((c) => c.id === "personalCare");
  const foodLimit = foodCat ? foodCat.amount : 0;
  const personalLimit = personalCat ? personalCat.amount : 0;

  function getActual(catId, key) {
    if (catId === "food") return byMonth[key]?.food ?? null;
    if (catId === "personalCare") return byMonth[key]?.personal ?? null;
    const v = actuals[key]?.[catId];
    return v === undefined ? null : v;
  }
  function updateActual(catId, val) {
    const num = val === "" ? null : Number(val);
    const monthData = { ...(actuals[selectedMonthKey] || {}) };
    if (num === null || Number.isNaN(num)) delete monthData[catId];
    else monthData[catId] = num;
    persistActuals({ ...actuals, [selectedMonthKey]: monthData });
  }

  function getNote(catId, key) {
    return notes[key]?.[catId] ?? "";
  }
  function updateNote(catId, val) {
    const monthData = { ...(notes[selectedMonthKey] || {}) };
    if (!val) delete monthData[catId];
    else monthData[catId] = val;
    const next = { ...notes, [selectedMonthKey]: monthData };
    setNotes(next); // update UI immediately so typing feels instant
    clearTimeout(noteSaveTimers.current[catId]);
    noteSaveTimers.current[catId] = setTimeout(() => persistNotes(next), 600); // debounce the actual save
  }

  const selPrevKey = prevMonthKey(selectedMonthKey);
  const selFoodSpent = byMonth[selectedMonthKey]?.food || 0;
  const selPersonalSpent = byMonth[selectedMonthKey]?.personal || 0;

  const monthsBefore = Object.keys(byMonth).filter((k) => k < selectedMonthKey).sort().slice(-3);
  const foodRollingAvg = monthsBefore.length > 0 ? monthsBefore.reduce((s, k) => s + (byMonth[k].food || 0), 0) / monthsBefore.length : null;
  const personalRollingAvg = monthsBefore.length > 0 ? monthsBefore.reduce((s, k) => s + (byMonth[k].personal || 0), 0) / monthsBefore.length : null;

  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const referenceTotal = (arr) => arr.reduce((s, r) => s + Number(r.amount || 0), 0);
  const foodReferenceTotal = referenceTotal(foodReference);
  const personalReferenceTotal = referenceTotal(personalReference);
  const totalAllocated = categories.reduce((s, c) => s + Number(c.amount || 0), 0);
  const leftover = income - totalAllocated;

  const monthPurchases = purchases.filter((p) => monthKey(new Date(p.date)) === selectedMonthKey).sort((a, b) => new Date(b.date) - new Date(a.date));

  const monthlySeries = useMemo(() => buildMonthlySeries(byMonth, 12), [byMonth]);
  const quarterlySeries = useMemo(() => buildQuarterlySeries(byMonth), [byMonth]);
  const yearlySeries = useMemo(() => buildYearlySeries(byMonth), [byMonth]);
  const qTrend = trendOf(quarterlySeries);
  const yTrend = trendOf(yearlySeries);
  const hasAnyData = purchases.length > 0;

  const efCumulative = useMemo(() => { let t = 0; Object.values(actuals).forEach((m) => { t += m.ef || 0; }); return t; }, [actuals]);
  const sipCumulative = useMemo(() => { let t = 0; Object.values(actuals).forEach((m) => { t += m.sip || 0; }); return t; }, [actuals]);
  const efSeries = useMemo(() => buildCumulativeSeries(actuals, "ef", 12), [actuals]);
  const sipSeries = useMemo(() => buildCumulativeSeries(actuals, "sip", 12), [actuals]);
  const hasEfData = Object.values(actuals).some((m) => m.ef);
  const hasSipData = Object.values(actuals).some((m) => m.sip);

  const pieMonths = useMemo(() => {
    if (pieScope === "quarter") return getMonthsInQuarter(selectedMonthKey);
    if (pieScope === "year") return getMonthsInYear(selectedMonthKey);
    return [selectedMonthKey];
  }, [pieScope, selectedMonthKey]);

  const pieData = useMemo(() => {
    return categories
      .map((c, i) => {
        const total = pieMonths.reduce((s, mk) => {
          const act = getActual(c.id, mk);
          return s + (act !== null ? act : c.amount);
        }, 0);
        return { name: c.label, value: total, color: PALETTE[i % PALETTE.length] };
      })
      .filter((d) => d.value > 0);
  }, [categories, actuals, byMonth, pieMonths]);
  const plannedVsSpent = useMemo(() => {
    return categories
      .map((c, i) => {
        const planned = c.amount * pieMonths.length;
        const spent = pieMonths.reduce((s, mk) => {
          if (c.id === "food") return s + (byMonth[mk]?.food || 0);
          if (c.id === "personalCare") return s + (byMonth[mk]?.personal || 0);
          const act = actuals[mk]?.[c.id];
          return s + (act === undefined ? 0 : act);
        }, 0);
        return { name: c.label, planned, spent, diff: planned - spent, color: PALETTE[i % PALETTE.length], type: c.type };
      })
      .filter((d) => d.planned > 0 || d.spent > 0);
  }, [categories, actuals, byMonth, pieMonths]);
  const pieTotal = pieData.reduce((s, d) => s + d.value, 0);
  const pieRows = pieTotal > 0 ? pieData : [{ name: "No planned money", value: 1, color: "#D3CBB5" }];
  const plannedTotal = plannedVsSpent.reduce((s, d) => s + d.planned, 0);
  const spentTotal = plannedVsSpent.reduce((s, d) => s + d.spent, 0);
  const plannedDiffTotal = plannedTotal - spentTotal;
  const pieHeading = pieScope === "month" ? monthLabel(selectedMonthKey)
    : pieScope === "quarter" ? `Q${Math.floor((Number(selectedMonthKey.split("-")[1]) - 1) / 3) + 1} ${selectedMonthKey.split("-")[0]}`
    : selectedMonthKey.split("-")[0];

  if (!loaded) return <div style={{ fontFamily: "sans-serif", padding: 24, color: "#5B5A52" }}>Loading ledger…</div>;

  return (
    <div style={{
      "--paper": "#EFEBE0", "--card": "#FFFDF8", "--ink": "#242219", "--ink-soft": "#6B6656", "--line": "#D3CBB5",
      "--turmeric": "#B9832A", "--clay": "#A24B3B", "--olive": "#5C7A4F",
      "--font-display": "Georgia, 'Iowan Old Style', 'Times New Roman', serif",
      "--font-body": "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
      "--font-mono": "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
      background: "var(--paper)", color: "var(--ink)", fontFamily: "var(--font-body)",
      padding: "28px 18px 60px", minHeight: "100%", boxSizing: "border-box",
    }}>
      <style>{`
        * { box-sizing: border-box; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        .field-row input { width: 100%; border: none; border-bottom: 1px solid var(--line); background: transparent; font-family: var(--font-mono); font-size: 13px; padding: 4px 2px; color: var(--ink); }
        .field-row input:focus { outline: none; border-bottom: 1px solid var(--ink); }
        .field-row input::placeholder { color: var(--line); }
        .field-row input:disabled { color: var(--ink-soft); }
        .label-input { border: none; background: transparent; font-family: var(--font-body); font-size: 13px; color: var(--ink-soft); padding: 4px 2px; width: 100%; border-bottom: 1px dotted transparent; }
        .label-input:hover, .label-input:focus { border-bottom: 1px dotted var(--line); outline: none; }
        .receipt-edge-top, .receipt-edge-bottom { height: 9px; background-image: linear-gradient(-45deg, var(--paper) 5px, transparent 0), linear-gradient(45deg, var(--paper) 5px, transparent 0); background-size: 10px 10px; background-repeat: repeat-x; }
        .receipt-edge-top { background-position: left top; }
        .receipt-edge-bottom { background-position: left bottom; transform: rotate(180deg); }
        .add-btn { background: var(--ink); color: var(--card); border: none; border-radius: 3px; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }
        .add-btn:hover { background: var(--turmeric); }
        .nav-btn { background: none; border: 1px solid var(--line); border-radius: 4px; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--ink); flex-shrink: 0; }
        .nav-btn:hover:not(:disabled) { background: var(--ink); color: var(--card); }
        .nav-btn:disabled { opacity: 0.3; cursor: default; }
        .del-btn { background: none; border: none; color: var(--ink-soft); cursor: pointer; padding: 4px; display: flex; align-items: center; flex-shrink: 0; }
        .del-btn:hover { color: var(--clay); }
        .purchase-row { animation: slideIn 0.25s ease; }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        .stamp { transform: rotate(-6deg); border: 2px solid currentColor; padding: 4px 10px; border-radius: 4px; font-family: var(--font-mono); font-weight: 700; font-size: 11px; letter-spacing: 1.5px; display: inline-block; }
        .save-note { font-family: var(--font-mono); font-size: 11px; color: var(--olive); opacity: ${saveNote ? 1 : 0}; transition: opacity 0.3s; }
        .section-title { font-size: 12px; letter-spacing: 1px; color: var(--ink-soft); text-transform: uppercase; margin: 0 0 10px; }
        .card { background: var(--card); border: 1px solid var(--line); border-radius: 6px; padding: 18px 20px; }
        .grid-row { display: grid; grid-template-columns: 1fr 62px 62px 58px 100px 22px; gap: 6px; align-items: center; padding: 6px 0; }
        .note-input { width: 100%; background: transparent; border: none; border-bottom: 1px solid var(--line); font-size: 11px; font-family: var(--font-mono); color: var(--ink); padding: 2px 0; }
        .note-input:focus { outline: none; border-bottom-color: var(--ink); }
        .grid-head { font-size: 9.5px; letter-spacing: 0.5px; color: var(--ink-soft); text-transform: uppercase; font-family: var(--font-mono); }
        .pill-active { background: var(--ink) !important; color: var(--card) !important; }
      `}</style>

      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, margin: 0 }}>Budget Pilot</h1>
            <span className="save-note">{saveNote}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p style={{ color: "var(--ink-soft)", fontSize: 13, margin: "4px 0 0" }}>Everything autosaves to your own database.</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              {user?.email && <span title={user.email} style={{ color: "var(--ink-soft)", fontSize: 11.5, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</span>}
              <button onClick={() => supabase.auth.signOut()} style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                <LogOut size={13} /> Sign out
              </button>
            </div>
          </div>
        </div>

        {/* Month navigator */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 18 }}>
          <button className="nav-btn" onClick={() => setSelectedMonthKey(shiftMonth(selectedMonthKey, -1))} aria-label="Previous month"><ChevronLeft size={16} /></button>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, minWidth: 130, textAlign: "center" }}>
            {monthLabel(selectedMonthKey)}
            {!isCurrentReal && (
              <button onClick={() => setSelectedMonthKey(realCurrentKey)} style={{ display: "block", margin: "2px auto 0", background: "none", border: "none", color: "var(--turmeric)", fontSize: 10.5, cursor: "pointer", textDecoration: "underline" }}>jump to current</button>
            )}
          </div>
          <button className="nav-btn" onClick={() => setSelectedMonthKey(shiftMonth(selectedMonthKey, 1))} disabled={isCurrentReal} aria-label="Next month"><ChevronRight size={16} /></button>
        </div>

        {/* Budget table */}
        <div className="card" style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span className="section-title" style={{ margin: 0 }}>Monthly income</span>
            <div className="field-row" style={{ width: 120 }}><input type="number" value={income} onChange={(e) => persistIncome(Number(e.target.value) || 0)} style={{ textAlign: "right", fontSize: 15, fontWeight: 600 }} /></div>
          </div>

          <div className="grid-row" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 6, marginBottom: 2 }}>
            <span className="grid-head">Category</span>
            <span className="grid-head" style={{ textAlign: "right" }}>Planned</span>
            <span className="grid-head" style={{ textAlign: "center" }}>Actual</span>
            <span className="grid-head" style={{ textAlign: "right" }}>Prev Month</span>
            <span className="grid-head" style={{ textAlign: "center" }}>Notes</span>
            <span />
          </div>

          {categories.map((c) => {
            const curr = getActual(c.id, selectedMonthKey);
            const prev = getActual(c.id, selPrevKey);
            const delta = curr !== null && prev !== null ? curr - prev : null;
            const isSaving = c.type === "saving";
            let deltaColor = "var(--ink-soft)";
            if (delta !== null && delta !== 0) { deltaColor = (isSaving ? delta > 0 : delta < 0) ? "var(--olive)" : "var(--clay)"; }
            const isAuto = c.id === "food" || c.id === "personalCare";
            return (
              <div key={c.id} className="grid-row">
                <input type="text" className="label-input" value={c.label} onChange={(e) => updateCatLabel(c.id, e.target.value)} />
                <div className="field-row"><input type="number" value={c.amount} onChange={(e) => updateCatAmount(c.id, e.target.value)} style={{ textAlign: "right" }} /></div>
                <div className="field-row">
                  {isAuto ? (
                    <input type="number" value={curr ?? 0} disabled style={{ textAlign: "right" }} />
                  ) : (
                    <input type="number" placeholder="—" value={curr ?? ""} onChange={(e) => updateActual(c.id, e.target.value)} style={{
  textAlign: curr === null ? "center" : "right",
}} />
                  )}
                </div>
                <span
  style={{
    textAlign: delta === null ? "center" : "right",
    fontFamily: "var(--font-mono)",
    fontSize: 11.5,
    color: deltaColor,
    display: "block",
  }}
>
  {delta === null ? "—" : fmtDelta(delta)}
</span>
                <input
  type="text"
  className="note-input"
  placeholder="—"
  value={getNote(c.id, selectedMonthKey)}
  onChange={(e) => updateNote(c.id, e.target.value)}
  title={getNote(c.id, selectedMonthKey)}
  style={{
    textAlign: getNote(c.id, selectedMonthKey) ? "left" : "center",
  }}
/>
                {isAuto ? <span /> : <button className="del-btn" onClick={() => removeCategory(c.id)} aria-label="Remove category"><Trash2 size={12} /></button>}
              </div>
            );
          })}

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <div className="field-row" style={{ flex: 1 }}><input type="text" placeholder="Add a category" value={catName} onChange={(e) => setCatName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCategory()} /></div>
            <div className="field-row" style={{ width: 90 }}><input type="number" placeholder="₹" value={catAmount} onChange={(e) => setCatAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCategory()} /></div>
            <button className="add-btn" onClick={addCategory} aria-label="Add category"><Plus size={16} /></button>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--ink)", marginTop: 12, paddingTop: 10, fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 14 }}>
            <span>Unallocated (planned)</span>
            <span style={{ color: leftover < 0 ? "var(--clay)" : "var(--olive)" }}>{fmt(leftover)}</span>
          </div>
          <p style={{ fontSize: 10.5, color: "var(--ink-soft)", marginTop: 10, marginBottom: 0 }}>
            Food and Personal care fill in automatically from the purchase log below. Everything else — type in the Actual once you pay it.
          </p>
        </div>

        {/* Planned vs spent */}
        <div className="card" style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div className="section-title" style={{ margin: 0 }}>{pieHeading} · planned vs spent</div>
            <div style={{ display: "flex", gap: 6 }}>
              {["month", "quarter", "year"].map((s) => (
                <button key={s} className={pieScope === s ? "pill-active" : ""} style={PILL_BASE} onClick={() => setPieScope(s)}>{s[0].toUpperCase() + s.slice(1)}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ width: 160, height: 160, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieRows} dataKey="value" nameKey="name" innerRadius={40} outerRadius={72} paddingAngle={1.5}>
                    {pieRows.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontFamily: "monospace", fontSize: 12, border: "1px solid #D3CBB5", borderRadius: 4 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(120px, 1fr) 58px 58px 58px", gap: 8, paddingBottom: 5, borderBottom: "1px solid var(--line)", fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ink-soft)", textTransform: "uppercase" }}>
                <span>Category</span>
                <span style={{ textAlign: "right" }}>Plan</span>
                <span style={{ textAlign: "right" }}>Spent</span>
                <span style={{ textAlign: "right" }}>Left</span>
              </div>
              {plannedVsSpent.length > 0 ? plannedVsSpent.map((d, i) => {
                const isGood = d.type === "saving" ? d.diff <= 0 : d.diff >= 0;
                const diffColor = d.diff === 0 ? "var(--ink-soft)" : isGood ? "var(--olive)" : "var(--clay)";
                return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(120px, 1fr) 58px 58px 58px", gap: 8, alignItems: "center", padding: "4px 0", fontSize: 12 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink-soft)", minWidth: 0 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color, display: "inline-block", flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", textAlign: "right" }}>{fmtShort(d.planned)}</span>
                    <span style={{ fontFamily: "var(--font-mono)", textAlign: "right" }}>{fmtShort(d.spent)}</span>
                    <span style={{ fontFamily: "var(--font-mono)", textAlign: "right", color: diffColor }}>{fmtShort(d.diff)}</span>
                  </div>
                );
              }) : (
                <div style={{ color: "var(--ink-soft)", fontSize: 12, paddingTop: 8 }}>Add planned or actual amounts to see the split.</div>
              )}
              {plannedVsSpent.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "minmax(120px, 1fr) 58px 58px 58px", gap: 8, borderTop: "1px solid var(--line)", marginTop: 6, paddingTop: 7, fontSize: 12.5, fontWeight: 700 }}>
                  <span>Total</span>
                  <span style={{ fontFamily: "var(--font-mono)", textAlign: "right" }}>{fmtShort(plannedTotal)}</span>
                  <span style={{ fontFamily: "var(--font-mono)", textAlign: "right" }}>{fmtShort(spentTotal)}</span>
                  <span style={{ fontFamily: "var(--font-mono)", textAlign: "right", color: plannedDiffTotal >= 0 ? "var(--olive)" : "var(--clay)" }}>{fmtShort(plannedDiffTotal)}</span>
                </div>
              )}
            </div>
          </div>
          {pieScope !== "month" && <p style={{ fontSize: 10.5, color: "var(--ink-soft)", marginTop: 10, marginBottom: 0 }}>Sums {pieScope === "quarter" ? "3 months" : "12 months"}; spent uses only logged actuals.</p>}
        </div>

        {/* EF & SIP */}
        <div style={{ display: "flex", gap: 12, marginBottom: 22, flexWrap: "wrap" }}>
          <div className="card" style={{ flex: 1, minWidth: 240 }}>
            <div className="section-title">Emergency fund — saved so far</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700 }}>{fmt(efCumulative)}</div>
            {hasEfData && <SingleBarChart data={efSeries} color="var(--olive)" />}
          </div>
          <div className="card" style={{ flex: 1, minWidth: 240 }}>
            <div className="section-title">SIP — invested so far</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700 }}>{fmt(sipCumulative)}</div>
            {hasSipData && <SingleBarChart data={sipSeries} color="var(--turmeric)" />}
          </div>
        </div>
        {(!hasEfData || !hasSipData) && <p style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: -14, marginBottom: 22 }}>Fill in "Actual" for EF / SIP above to see these grow — lifetime totals, not tied to the month navigator.</p>}

        {/* Food & Personal Care trackers — side by side */}
        <div style={{ display: "flex", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
          <BucketBlock label={`${monthLabel(selectedMonthKey)} · Food`} spent={selFoodSpent} limit={foodLimit} isCurrentReal={isCurrentReal} dayOfMonth={dayOfMonth} daysInMonth={daysInMonth} rollingAvg={foodRollingAvg} pastCount={monthsBefore.length} />
          <BucketBlock label={`${monthLabel(selectedMonthKey)} · Personal care`} spent={selPersonalSpent} limit={personalLimit} isCurrentReal={isCurrentReal} dayOfMonth={dayOfMonth} daysInMonth={daysInMonth} rollingAvg={personalRollingAvg} pastCount={monthsBefore.length} />
        </div>

        {/* Reference breakdowns */}
        <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <button onClick={() => setShowFoodRef((s) => !s)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12.5, color: "var(--ink-soft)", textDecoration: "underline", textUnderlineOffset: 3, fontFamily: "var(--font-body)" }}>
              {showFoodRef ? "Hide" : "What's inside"} Food's {fmt(foodLimit)}
            </button>
            {showFoodRef && (
              <div className="card" style={{ marginTop: 10, padding: "14px 18px" }}>
                {foodReference.map((r) => (
                  <div key={r.id} className="field-row" style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
                    <input type="text" className="label-input" value={r.name} onChange={(e) => persistFoodRef(foodReference.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)))} />
                    <div style={{ width: 80 }}><input type="number" value={r.amount} onChange={(e) => updateRefAmount("food", r.id, e.target.value)} style={{ textAlign: "right" }} /></div>
                    <button className="del-btn" onClick={() => removeRefItem("food", r.id)} aria-label="Remove item"><Trash2 size={13} /></button>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  <div className="field-row" style={{ flex: 1 }}><input type="text" placeholder="Add item" value={refName.food} onChange={(e) => setRefName({ ...refName, food: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addRefItem("food")} /></div>
                  <div className="field-row" style={{ width: 70 }}><input type="number" placeholder="₹" value={refAmount.food} onChange={(e) => setRefAmount({ ...refAmount, food: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addRefItem("food")} /></div>
                  <button className="add-btn" onClick={() => addRefItem("food")} aria-label="Add"><Plus size={14} /></button>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--line)", marginTop: 10, paddingTop: 8, fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  <span>Total: <strong>{fmt(foodReferenceTotal)}</strong></span>
                  {foodReferenceTotal !== foodLimit && <button onClick={() => updateCatAmount("food", foodReferenceTotal)} style={{ background: "none", border: "1px solid var(--ink)", borderRadius: 4, padding: "3px 7px", fontSize: 10, cursor: "pointer" }}>Use as limit</button>}
                </div>
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <button onClick={() => setShowPersonalRef((s) => !s)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12.5, color: "var(--ink-soft)", textDecoration: "underline", textUnderlineOffset: 3, fontFamily: "var(--font-body)" }}>
              {showPersonalRef ? "Hide" : "What's inside"} Personal care's {fmt(personalLimit)}
            </button>
            {showPersonalRef && (
              <div className="card" style={{ marginTop: 10, padding: "14px 18px" }}>
                {personalReference.map((r) => (
                  <div key={r.id} className="field-row" style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
                    <input type="text" className="label-input" value={r.name} onChange={(e) => persistPersonalRef(personalReference.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)))} />
                    <div style={{ width: 80 }}><input type="number" value={r.amount} onChange={(e) => updateRefAmount("personal", r.id, e.target.value)} style={{ textAlign: "right" }} /></div>
                    <button className="del-btn" onClick={() => removeRefItem("personal", r.id)} aria-label="Remove item"><Trash2 size={13} /></button>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  <div className="field-row" style={{ flex: 1 }}><input type="text" placeholder="Add item" value={refName.personal} onChange={(e) => setRefName({ ...refName, personal: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addRefItem("personal")} /></div>
                  <div className="field-row" style={{ width: 70 }}><input type="number" placeholder="₹" value={refAmount.personal} onChange={(e) => setRefAmount({ ...refAmount, personal: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addRefItem("personal")} /></div>
                  <button className="add-btn" onClick={() => addRefItem("personal")} aria-label="Add"><Plus size={14} /></button>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--line)", marginTop: 10, paddingTop: 8, fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  <span>Total: <strong>{fmt(personalReferenceTotal)}</strong></span>
                  {personalReferenceTotal !== personalLimit && <button onClick={() => updateCatAmount("personalCare", personalReferenceTotal)} style={{ background: "none", border: "1px solid var(--ink)", borderRadius: 4, padding: "3px 7px", fontSize: 10, cursor: "pointer" }}>Use as limit</button>}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Add purchase — with category toggle */}
        {isCurrentReal ? (
          <div style={{ margin: "20px 0" }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {[["food", "Food"], ["personal", "Personal care"]].map(([val, lbl]) => (
                <button key={val} className={purchaseCategory === val ? "pill-active" : ""} style={PILL_BASE} onClick={() => setPurchaseCategory(val)}>{lbl}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div className="field-row" style={{ flex: 2 }}><input type="text" placeholder={purchaseCategory === "food" ? "Item — e.g. Badam 500g" : "Item — e.g. Face wash"} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPurchase()} style={{ fontFamily: "var(--font-body)" }} /></div>
              <div className="field-row" style={{ flex: 1 }}><input type="number" placeholder="₹" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPurchase()} /></div>
              <button className="add-btn" onClick={addPurchase} aria-label="Add purchase"><Plus size={18} /></button>
            </div>
          </div>
        ) : (
          <p style={{ fontSize: 11.5, color: "var(--ink-soft)", margin: "18px 0 8px", textAlign: "center" }}>Viewing a past month — new purchases can only be logged in the current month.</p>
        )}

        {/* Receipt */}
        <div>
          <div className="receipt-edge-top" />
          <div style={{ background: "var(--card)", padding: "6px 20px" }}>
            {monthPurchases.length === 0 ? (
              <div style={{ padding: "20px 0", textAlign: "center", color: "var(--ink-soft)", fontSize: 13 }}>No purchases logged for {monthLabel(selectedMonthKey)}.</div>
            ) : (
              monthPurchases.map((p) => (
                <div key={p.id} className="purchase-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px dashed var(--line)", fontFamily: "var(--font-mono)", fontSize: 13.5 }}>
                  <div>
                    <div>{p.name} <span style={{ fontSize: 9.5, color: p.category === "personal" ? PERSONAL_COLOR : FOOD_COLOR, border: "1px solid currentColor", borderRadius: 3, padding: "1px 4px", marginLeft: 4 }}>{p.category === "personal" ? "personal" : "food"}</span></div>
                    <div style={{ fontSize: 10.5, color: "var(--ink-soft)" }}>{new Date(p.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span>{fmt(p.amount)}</span>
                    <button className="del-btn" onClick={() => removePurchase(p.id)} aria-label="Remove"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))
            )}
            {monthPurchases.length > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13.5 }}><span>Total</span><span>{fmt(selFoodSpent + selPersonalSpent)}</span></div>
            )}
          </div>
          <div className="receipt-edge-bottom" />
        </div>

        {/* Analysis — dual bars */}
        <div style={{ marginTop: 34 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 19, margin: "0 0 4px" }}>Spending analysis — Food vs Personal care</h2>
          <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0 0 16px" }}>Built automatically from every purchase you log.</p>
          {!hasAnyData ? (
            <div className="card" style={{ textAlign: "center", color: "var(--ink-soft)", fontSize: 13 }}>Log a few purchases across different months to see charts here.</div>
          ) : (
            <>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-title">Last 12 months</div>
                <DualBarChart data={monthlySeries} />
              </div>
              {/* <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-title">By quarter</div>
                <DualBarChart data={quarterlySeries} />
                {qTrend && <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 8, marginBottom: 0, fontFamily: "var(--font-mono)" }}>Combined quarterly avg: {fmt(qTrend.avg)}{qTrend.pct !== null && <span style={{ color: qTrend.pct > 0 ? "var(--clay)" : "var(--olive)" }}> · {qTrend.pct > 0 ? "up" : "down"} {Math.abs(qTrend.pct).toFixed(0)}% vs previous quarter</span>}</p>}
              </div>
              <div className="card">
                <div className="section-title">By year</div>
                <DualBarChart data={yearlySeries} />
                {yTrend && <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 8, marginBottom: 0, fontFamily: "var(--font-mono)" }}>Combined yearly avg/month: {fmt(yTrend.avg / 12)}{yTrend.pct !== null && <span style={{ color: yTrend.pct > 0 ? "var(--clay)" : "var(--olive)" }}> · {yTrend.pct > 0 ? "up" : "down"} {Math.abs(yTrend.pct).toFixed(0)}% vs previous year</span>}</p>}
              </div> */}
            </>
          )}
        </div>

        <p style={{ fontSize: 11.5, color: "var(--ink-soft)", textAlign: "center", marginTop: 24 }}>Every field autosaves. Months roll over automatically — nothing is ever erased.</p>
      </div>
    </div>
  );
}