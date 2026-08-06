import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Home, ListChecks, Repeat, Wallet, BookOpen, StickyNote, Calendar,
  BarChart3, Plus, Trash2, ChevronLeft, ChevronRight, Target, PiggyBank,
  TrendingUp, TrendingDown, X, Check, Sparkles, Flag, FolderKanban, Circle,
  UtensilsCrossed, Dumbbell, Timer, Bell, Pencil, ArrowDownCircle, ArrowUpCircle,
  Play, Pause, RotateCcw, ChefHat, Settings, Upload, Download, Image as ImageIcon
} from "lucide-react";

/* ---------------------------------------------------------
   MI AGENDA — SAN-ORGANIC
   Agenda personal completa: prioridades, hábitos, finanzas
   (con metas, ahorros y categorías), metas no monetarias,
   proyectos, comidas + recetas, entrenamiento, diario,
   notas, calendario semanal/mensual, pomodoro y recordatorios.
   Todo se guarda en localStorage.
--------------------------------------------------------- */

const STORAGE_KEY = "mi-agenda-sanorganic-v2";

const uid = () => Math.random().toString(36).slice(2, 10);
const todayISO = () => toISO(new Date()); // fecha LOCAL, no UTC (evita el desfase de un día)
const monthKey = (isoDate) => isoDate.slice(0, 7);
const currentMonthKey = () => todayISO().slice(0, 7);

const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const WEEKDAYS_MON_FIRST = [1, 2, 3, 4, 5, 6, 0]; // orden Lunes..Domingo, valores = getDay()

const monthLabel = (key) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
};

const formatCLP = (n) => "$" + Math.round(n || 0).toLocaleString("es-CL");

const shiftMonth = (key, delta) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const startOfWeek = (isoDate) => {
  const d = new Date(isoDate + "T00:00:00");
  const day = d.getDay(); // 0=Dom
  const diff = day === 0 ? -6 : 1 - day; // retroceder hasta el lunes
  d.setDate(d.getDate() + diff);
  return d;
};

const habitWeekProgress = (h, today, weekStart) => {
  if (h.mode === "weekly") {
    let total = 0;
    for (let i = 0; i < 7; i++) {
      const iso = toISO(addDays(weekStart, i));
      if (iso > today) continue;
      total += h.log[iso] || 0;
    }
    return { done: total, required: h.targetCount || 1, weekTotal: total, pct: (h.targetCount || 1) ? total / (h.targetCount || 1) : 0 };
  }
  let done = 0, elapsedRequired = 0, weekTotal = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    const iso = toISO(d);
    if (iso > today) continue;
    if (h.targetDays.includes(d.getDay())) {
      elapsedRequired++;
      const qty = h.log[iso] || 0;
      weekTotal += qty;
      if (qty >= h.targetQty) done++;
    }
  }
  return { done, required: elapsedRequired, weekTotal, pct: elapsedRequired ? done / elapsedRequired : 0 };
};

const addDays = (date, n) => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
};

const toISO = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/* ---------- exportar archivos (CSV / ICS) ---------- */
const downloadFile = (filename, content, mime) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const toCSV = (rows) => {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
};

const icsEscape = (s) => String(s || "").replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");

const buildICS = (events) => {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SAN-ORGANIC//Mi Agenda//ES"];
  events.forEach((e) => {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@mi-agenda-sanorganic`,
      `DTSTART:${e.dtstart}`,
      e.dtend ? `DTEND:${e.dtend}` : "",
      `SUMMARY:${icsEscape(e.title)}`,
      "BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(e.title)}`, "END:VALARM",
      "END:VEVENT"
    );
  });
  lines.push("END:VCALENDAR");
  return lines.filter(Boolean).join("\r\n");
};

const dateTimeToICS = (isoDate, time) => {
  const [h, m] = (time || "09:00").split(":");
  return `${isoDate.replace(/-/g, "")}T${h.padStart(2, "0")}${m.padStart(2, "0")}00`;
};

const defaultData = () => ({
  name: "",
  priorities: {}, // { 'YYYY-MM-DD': [{id,text,done}] }
  habits: [
    { id: uid(), name: "Tomar agua", emoji: "💧", mode: "daily", targetQty: 3, unit: "vasos", targetDays: [1,2,3,4,5], log: {} },
    { id: uid(), name: "Hacer ejercicio", emoji: "🏋️", mode: "weekly", targetCount: 3, unit: "rutinas", log: {} },
  ],
  categories: {
    ingreso: ["Ventas SAN-ORGANIC", "Sueldo", "Otros ingresos"],
    egreso: ["Insumos", "Empaque", "Marketing", "Personal", "Otros"],
  },
  transactions: [], // {id,type:'ingreso'|'egreso'|'ahorro'|'retiro',concept,amount,category,date,pocketId?}
  goals: [],
  pockets: [], // {id,name,area,target}  (saldo se calcula desde transacciones)
  objectives: [],
  projects: [],
  notes: [], // {id,title,content,date,color,done,tags:[]}
  journal: {}, // { 'YYYY-MM-DD': {mood, reflection, text} }
  calendarEvents: {}, // { 'YYYY-MM-DD': [{id,title,time}] }
  recipes: [], // {id,name,ingredients,steps}
  meals: {}, // { 'YYYY-MM-DD': { desayuno:{text,recipeId}, almuerzo:{...}, cena:{...}, snack:{...} } }
  workouts: [], // {id,date,type,duration,notes}
  reminders: [], // {id,text,datetime,done}
  wallpaper: "", // URL de imagen de fondo (opcional)
});

function useLocalState() {
  const [data, setData] = useState(() => {
    try {
      const raw = typeof window !== "undefined" && window.localStorage ? localStorage.getItem(STORAGE_KEY) : null;
      return raw ? { ...defaultData(), ...JSON.parse(raw) } : defaultData();
    } catch {
      return defaultData();
    }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* memoria */ }
  }, [data]);

  return [data, setData];
}

const GlobalStyle = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

    .agenda-root {
      --bg:#fdf6f7; --bg-card:#ffffff; --bg-card-2:#f8e9ed;
      --line: rgba(150,41,76,0.13);
      --sage:#a23a5c; --sage-dim: rgba(162,58,92,0.11);
      --butter:#c96e8a; --butter-dim: rgba(201,110,138,0.14);
      --clay:#8a5762; --clay-dim: rgba(138,87,98,0.13);
      --text:#3c2530; --text-soft:#8d6b76; --text-faint:#c6a4af;
      font-family:'Manrope',sans-serif;
      background:var(--bg); color:var(--text);
      min-height:100vh; display:flex; border-radius:18px; overflow:hidden;
      box-shadow: 0 20px 60px rgba(150,41,76,0.14);
    }
    .agenda-root * { box-sizing:border-box; }
    .agenda-serif { font-family:'Fraunces', serif; }
    .agenda-mono { font-family:'IBM Plex Mono', monospace; }

    .a-nav {
      width:76px; flex-shrink:0; background:var(--bg-card);
      border-right:1px solid var(--line); display:flex; flex-direction:column;
      align-items:center; padding:16px 0; gap:4px; overflow-y:auto; max-height:92vh;
    }
    .a-navbtn {
      width:46px; height:46px; border-radius:14px; display:flex;
      align-items:center; justify-content:center; color:var(--text-soft);
      background:transparent; border:none; cursor:pointer; transition:all .15s; flex-shrink:0;
    }
    .a-navbtn:hover { background:var(--bg-card-2); color:var(--text); }
    .a-navbtn.active { background:var(--sage-dim); color:var(--sage); }
    .a-navlabel-mobile { display:none; }

    .a-main { flex:1; min-width:0; padding:28px 34px; overflow-y:auto; max-height:92vh; }
    .a-h1 { font-size:26px; font-weight:600; margin:0 0 4px; }
    .a-sub { color:var(--text-soft); font-size:13.5px; margin:0 0 24px; }

    .a-card { background:var(--bg-card); border:1px solid var(--line); border-radius:16px; padding:18px 20px; }
    .a-grid { display:grid; gap:14px; }
    .a-grid-3 { grid-template-columns:repeat(3,1fr); }
    .a-grid-2 { grid-template-columns:repeat(2,1fr); }
    .a-grid-4 { grid-template-columns:repeat(4,1fr); }
    .a-grid-7 { grid-template-columns:repeat(7,1fr); }
    .a-week-event { font-size:12.5px; }

    /* Grilla horaria semanal (escritorio) */
    .a-hourgrid-desktop { display:block; margin-bottom:16px; }
    .a-daygrid-mobile { display:none; }
    .a-hourgrid { display:grid; border:1px solid var(--line); border-radius:12px; overflow:hidden; background:var(--bg-card); }
    .a-hourgrid-corner { background:var(--bg-card-2); border-bottom:1px solid var(--line); border-right:1px solid var(--line); }
    .a-hourgrid-daylabel { background:var(--bg-card-2); border-bottom:1px solid var(--line); border-right:1px solid var(--line);
      font-size:11.5px; font-weight:700; text-transform:capitalize; text-align:center; padding:8px 4px; }
    .a-hourgrid-daylabel:last-child, .a-hourgrid-cell:last-child { border-right:none; }
    .a-hourgrid-hourlabel { border-top:1px solid var(--line); border-right:1px solid var(--line); background:var(--bg-card-2);
      font-size:10.5px; color:var(--text-soft); padding:6px 4px; text-align:right; font-family:'IBM Plex Mono',monospace; }
    .a-hourgrid-cell { border-top:1px solid var(--line); border-right:1px solid var(--line); min-height:30px; padding:2px; cursor:pointer; transition:background .1s; }
    .a-hourgrid-cell:hover { background:var(--bg-card-2); }
    .a-hourgrid-event { font-size:10px; background:var(--sage); color:#fff; border-radius:5px; padding:2px 5px; margin-bottom:2px; cursor:pointer; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

    /* Agenda de un día (celular) */
    .a-daygrid-row { display:flex; border-bottom:1px solid var(--line); padding:8px 10px; gap:10px; cursor:pointer; }
    .a-daygrid-row:last-child { border-bottom:none; }
    .a-daygrid-hour { font-size:12px; color:var(--text-soft); font-family:'IBM Plex Mono',monospace; width:48px; flex-shrink:0; padding-top:2px; }
    .a-daygrid-content { flex:1; }
    .a-daygrid-placeholder { color:var(--text-faint); font-size:13px; }

    .a-stat-label { font-size:11px; text-transform:uppercase; letter-spacing:.07em; color:var(--text-soft); margin-bottom:6px;}
    .a-stat-num { font-size:22px; font-weight:600; }

    .a-input, .a-select, textarea.a-input {
      background:var(--bg); border:1px solid var(--line); color:var(--text);
      border-radius:10px; padding:9px 11px; font-size:13.5px; font-family:inherit;
      width:100%; outline:none;
    }
    .a-input:focus, .a-select:focus { border-color:var(--sage); }

    .a-btn {
      background:var(--sage); color:#fff; border:none; border-radius:10px;
      padding:9px 16px; font-weight:700; font-size:13px; cursor:pointer;
      display:inline-flex; align-items:center; gap:6px; transition:opacity .15s;
    }
    .a-btn:hover { opacity:.88; }
    .a-btn.secondary { background:var(--bg-card-2); color:var(--text); border:1px solid var(--line); }
    .a-btn.danger { background:var(--clay-dim); color:var(--clay); }
    .a-btn.icon { padding:8px; }
    .a-btn.xs { padding:5px 10px; font-size:11px; }

    .a-pill { font-size:10.5px; padding:3px 9px; border-radius:999px; font-weight:700; letter-spacing:.02em;}
    .a-pill.in { background:var(--sage-dim); color:var(--sage); }
    .a-pill.out { background:var(--clay-dim); color:var(--clay); }
    .a-pill.ahorro { background: rgba(201,110,138,0.18); color:var(--butter); }
    .a-pill.chip { background:var(--bg-card-2); color:var(--text-soft); }

    .a-row { display:flex; align-items:center; justify-content:space-between; gap:10px; }
    .a-divider { height:1px; background:var(--line); margin:16px 0; border:none; }

    .a-monthnav { display:flex; align-items:center; gap:10px; }
    .a-monthnav button { background:var(--bg-card-2); border:1px solid var(--line); color:var(--text);
      width:30px; height:30px; border-radius:8px; display:flex; align-items:center; justify-content:center; cursor:pointer;}

    .a-ring-wrap { position:relative; width:78px; height:78px; flex-shrink:0; }
    .a-ring-label { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
      font-size:13px; font-weight:700; font-family:'IBM Plex Mono',monospace; }

    .a-list-item { display:flex; align-items:center; gap:10px; padding:9px 0; border-bottom:1px solid var(--line); }
    .a-list-item:last-child { border-bottom:none; }

    .a-check { width:19px; height:19px; border-radius:6px; border:1.5px solid var(--text-faint);
      display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; }
    .a-check.done { background:var(--sage); border-color:var(--sage); color:#fff; }

    .a-daychip { width:28px; height:28px; border-radius:8px; border:1px solid var(--line); background:var(--bg);
      display:flex; align-items:center; justify-content:center; font-size:10.5px; cursor:pointer; color:var(--text-soft); }
    .a-daychip.on { background:var(--sage); color:#fff; border-color:var(--sage); }

    .a-note { border-radius:14px; padding:14px; position:relative; min-height:120px; display:flex; flex-direction:column; }
    .a-tag { font-size:10px; padding:2px 8px; border-radius:999px; background:rgba(0,0,0,0.08); }

    @media (max-width: 760px) {
      .agenda-root { flex-direction:column; border-radius:0; }
      .a-nav { width:100%; flex-direction:row; justify-content:flex-start; padding:8px 4px; order:2; max-height:none; overflow-x:auto; overflow-y:visible; }
      .a-navbtn { flex-direction:column; width:auto; height:auto; padding:6px 9px; border-radius:10px; gap:2px; }
      .a-navlabel-mobile { display:block; font-size:8.5px; font-weight:600; white-space:nowrap; }
      .a-main { max-height:none; padding:18px 16px 90px; }
      .a-grid-3, .a-grid-4, .a-grid-2 { grid-template-columns:1fr; }
      .a-grid-7 { grid-template-columns:repeat(7,minmax(34px,1fr)); }
      .a-week-event { font-size:14.5px; }
      .a-h1 { font-size:22px; }
      .a-hourgrid-desktop { display:none; }
      .a-daygrid-mobile { display:block; }
    }
  `}</style>
);

/* ---------------- RING PROGRESS ---------------- */
function Ring({ pct, color = "var(--sage)", size = 78, showLabel = true }) {
  const clamped = Math.max(0, Math.min(1, pct || 0));
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="a-ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--line)" strokeWidth="7" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="7" fill="none"
          strokeDasharray={c} strokeDashoffset={c - clamped * c} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset .4s ease" }} />
      </svg>
      {showLabel && <div className="a-ring-label">{Math.round(clamped * 100)}%</div>}
    </div>
  );
}

const NAV = [
  { id: "inicio", label: "Inicio", icon: Home },
  { id: "prioridades", label: "Día", icon: ListChecks },
  { id: "habitos", label: "Hábitos", icon: Repeat },
  { id: "finanzas", label: "Finanzas", icon: Wallet },
  { id: "objetivos", label: "Metas", icon: Flag },
  { id: "proyectos", label: "Proyectos", icon: FolderKanban },
  { id: "comidas", label: "Comidas", icon: UtensilsCrossed },
  { id: "entrenamiento", label: "Entreno", icon: Dumbbell },
  { id: "diario", label: "Diario", icon: BookOpen },
  { id: "notas", label: "Notas", icon: StickyNote },
  { id: "calendario", label: "Agenda", icon: Calendar },
  { id: "pomodoro", label: "Pomodoro", icon: Timer },
  { id: "recordatorios", label: "Recordatorios", icon: Bell },
  { id: "stats", label: "Stats", icon: BarChart3 },
  { id: "ajustes", label: "Ajustes", icon: Settings },
];

/* ============================================================ */

/* Temporizador Pomodoro vivo a nivel raíz: así sigue corriendo aunque cambies de pestaña */
function usePomodoro() {
  const WORK = 25 * 60, BREAK = 5 * 60;
  const [secondsLeft, setSecondsLeft] = useState(WORK);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState("work");
  const [cycles, setCycles] = useState(0);
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          const current = modeRef.current;
          const next = current === "work" ? "break" : "work";
          if (current === "work") setCycles((c) => c + 1);
          setMode(next);
          return next === "work" ? WORK : BREAK;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const reset = () => { setRunning(false); setMode("work"); setSecondsLeft(WORK); };
  const toggle = () => setRunning((r) => !r);
  const total = mode === "work" ? WORK : BREAK;
  return { secondsLeft, running, mode, cycles, total, toggle, reset };
}

export default function AgendaApp() {
  const [data, setData] = useLocalState();
  const [tab, setTab] = useState("inicio");
  const [month, setMonth] = useState(currentMonthKey());
  const [financeTab, setFinanceTab] = useState("resumen");
  const pomodoro = usePomodoro();
  const notifiedRef = useRef(new Set());

  const patch = (fn) => setData((d) => ({ ...d, ...fn(d) }));

  /* ---------- avisos del navegador para recordatorios vencidos (persiste entre pestañas) ---------- */
  useEffect(() => {
    const check = () => {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      const now = new Date();
      data.reminders.forEach((r) => {
        if (r.done || !r.datetime || notifiedRef.current.has(r.id)) return;
        if (new Date(r.datetime) <= now) {
          new Notification("Recordatorio — Mi Agenda", { body: r.text });
          notifiedRef.current.add(r.id);
        }
      });
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [data.reminders]);

  /* ---------- fondo de pantalla personalizado ---------- */
  useEffect(() => {
    if (data.wallpaper) {
      document.body.style.backgroundImage = `url(${data.wallpaper})`;
      document.body.style.backgroundSize = "cover";
      document.body.style.backgroundPosition = "center";
      document.body.style.backgroundAttachment = "fixed";
    } else {
      document.body.style.backgroundImage = "";
    }
  }, [data.wallpaper]);

  /* ---------- derived: finance for selected month ---------- */
  const monthTx = useMemo(() => data.transactions.filter((t) => monthKey(t.date) === month), [data.transactions, month]);
  const ingresosMes = monthTx.filter((t) => t.type === "ingreso").reduce((s, t) => s + t.amount, 0);
  const egresosMes = monthTx.filter((t) => t.type === "egreso").reduce((s, t) => s + t.amount, 0);
  const ahorroMes = monthTx.filter((t) => t.type === "ahorro").reduce((s, t) => s + t.amount, 0);
  const retiroMes = monthTx.filter((t) => t.type === "retiro").reduce((s, t) => s + t.amount, 0);
  const balanceMes = ingresosMes - egresosMes - ahorroMes + retiroMes;

  const pocketBalance = (pocketId) => {
    const aportes = data.transactions.filter((t) => t.pocketId === pocketId && t.type === "ahorro").reduce((s, t) => s + t.amount, 0);
    const retiros = data.transactions.filter((t) => t.pocketId === pocketId && t.type === "retiro").reduce((s, t) => s + t.amount, 0);
    return aportes - retiros;
  };

  const goalProgress = (goal) => {
    if (goal.type === "mensual") {
      const base = data.transactions.filter((t) => t.type === "ingreso" && monthKey(t.date) === month && (!goal.category || t.category === goal.category));
      const sum = base.reduce((s, t) => s + t.amount, 0);
      return { current: sum, target: goal.target, pct: goal.target ? sum / goal.target : 0 };
    }
    const current = goal.pocketId ? pocketBalance(goal.pocketId) : 0;
    return { current, target: goal.target, pct: goal.target ? current / goal.target : 0 };
  };

  /* ---------- priorities ---------- */
  const todayList = data.priorities[todayISO()] || [];
  const addPriority = (text) => {
    if (!text.trim()) return;
    patch((d) => ({ priorities: { ...d.priorities, [todayISO()]: [...(d.priorities[todayISO()] || []), { id: uid(), text, done: false }] } }));
  };
  const togglePriority = (id) => {
    patch((d) => ({ priorities: { ...d.priorities, [todayISO()]: (d.priorities[todayISO()] || []).map((p) => p.id === id ? { ...p, done: !p.done } : p) } }));
  };
  const delPriority = (id) => {
    patch((d) => ({ priorities: { ...d.priorities, [todayISO()]: (d.priorities[todayISO()] || []).filter((p) => p.id !== id) } }));
  };
  const progressPct = todayList.length ? todayList.filter((p) => p.done).length / todayList.length : 0;

  /* ---------- upcoming events (para dashboard) ---------- */
  const upcomingEvents = useMemo(() => {
    const all = [];
    Object.entries(data.calendarEvents || {}).forEach(([date, evs]) => {
      evs.forEach((e) => { if (date >= todayISO()) all.push({ ...e, date }); });
    });
    return all.sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || ""))).slice(0, 5);
  }, [data.calendarEvents]);

  return (
    <div className="agenda-root">
      <GlobalStyle />
      <nav className="a-nav">
        {NAV.map((n) => {
          const Icon = n.icon;
          return (
            <button key={n.id} className={`a-navbtn ${tab === n.id ? "active" : ""}`} onClick={() => setTab(n.id)} title={n.label} style={{ position: "relative" }}>
              <Icon size={18} />
              <span className="a-navlabel-mobile">{n.label}</span>
              {n.id === "pomodoro" && pomodoro.running && (
                <span style={{ position: "absolute", top: 6, right: 8, width: 7, height: 7, borderRadius: "50%", background: "var(--sage)" }} />
              )}
            </button>
          );
        })}
      </nav>

      <main className="a-main">
        {tab === "inicio" && (
          <InicioTab data={data} todayList={todayList} progressPct={progressPct} ingresosMes={ingresosMes} egresosMes={egresosMes}
            month={month} goalProgress={goalProgress} goToFinanzas={() => setTab("finanzas")} upcomingEvents={upcomingEvents} />
        )}
        {tab === "prioridades" && <PrioridadesTab list={todayList} onAdd={addPriority} onToggle={togglePriority} onDelete={delPriority} />}
        {tab === "habitos" && <HabitosTab data={data} patch={patch} />}
        {tab === "finanzas" && (
          <FinanzasTab data={data} patch={patch} month={month} setMonth={setMonth} monthTx={monthTx}
            ingresosMes={ingresosMes} egresosMes={egresosMes} ahorroMes={ahorroMes} retiroMes={retiroMes} balanceMes={balanceMes}
            goalProgress={goalProgress} pocketBalance={pocketBalance} financeTab={financeTab} setFinanceTab={setFinanceTab} />
        )}
        {tab === "objetivos" && <ObjetivosTab data={data} patch={patch} />}
        {tab === "proyectos" && <ProyectosTab data={data} patch={patch} />}
        {tab === "comidas" && <ComidasTab data={data} patch={patch} />}
        {tab === "entrenamiento" && <EntrenamientoTab data={data} patch={patch} />}
        {tab === "diario" && <DiarioTab data={data} patch={patch} />}
        {tab === "notas" && <NotasTab data={data} patch={patch} />}
        {tab === "calendario" && <CalendarioTab data={data} patch={patch} />}
        {tab === "pomodoro" && <PomodoroTab {...pomodoro} />}
        {tab === "recordatorios" && <RecordatoriosTab data={data} patch={patch} />}
        {tab === "stats" && <StatsTab data={data} month={month} monthTx={monthTx} />}
        {tab === "ajustes" && <AjustesTab data={data} patch={patch} setData={setData} />}
      </main>
    </div>
  );
}

/* ================= INICIO ================= */
function InicioTab({ data, todayList, progressPct, ingresosMes, egresosMes, month, goalProgress, goToFinanzas, upcomingEvents }) {
  const topGoals = data.goals.slice(0, 2);
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const dayLabel = now.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
  const timeLabel = now.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div>
      <div className="a-row" style={{ alignItems: "flex-start", marginBottom: 4, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="a-h1 agenda-serif">{data.name ? `Hola, ${data.name} 🌿` : "Hola 🌿"}</h1>
          <p className="a-sub" style={{ marginBottom: 0 }}>Tu resumen de {monthLabel(month)}.</p>
        </div>
        <div className="a-card" style={{ padding: "10px 16px", textAlign: "right" }}>
          <div className="a-sub" style={{ margin: 0, textTransform: "capitalize" }}>{dayLabel}</div>
          <div className="agenda-mono" style={{ fontSize: 20, fontWeight: 700 }}>{timeLabel}</div>
        </div>
      </div>
      <div style={{ marginBottom: 20 }} />

      <div className="a-grid a-grid-3" style={{ marginBottom: 16 }}>
        <div className="a-card">
          <div className="a-stat-label">Progreso del día</div>
          <div className="a-stat-num agenda-mono">{Math.round(progressPct * 100)}%</div>
        </div>
        <div className="a-card">
          <div className="a-stat-label">Ingresos del mes</div>
          <div className="a-stat-num agenda-mono" style={{ color: "var(--sage)" }}>{formatCLP(ingresosMes)}</div>
        </div>
        <div className="a-card">
          <div className="a-stat-label">Egresos del mes</div>
          <div className="a-stat-num agenda-mono" style={{ color: "var(--clay)" }}>{formatCLP(egresosMes)}</div>
        </div>
      </div>

      <div className="a-grid a-grid-2" style={{ marginBottom: 16 }}>
        <div className="a-card">
          <div className="a-row" style={{ marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>Prioridades de hoy</h3>
            <span className="a-sub" style={{ margin: 0 }}>{todayList.filter(t => t.done).length}/{todayList.length}</span>
          </div>
          {todayList.length === 0 && <p className="a-sub">Aún no tienes tareas para hoy.</p>}
          {todayList.slice(0, 4).map((p) => (
            <div className="a-list-item" key={p.id}>
              <div className={`a-check ${p.done ? "done" : ""}`}>{p.done && <Check size={12} />}</div>
              <span style={{ textDecoration: p.done ? "line-through" : "none", color: p.done ? "var(--text-faint)" : "var(--text)" }}>{p.text}</span>
            </div>
          ))}
        </div>

        <div className="a-card">
          <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>Próximas fechas</h3>
          {upcomingEvents.length === 0 && <p className="a-sub">Sin eventos próximos en tu agenda.</p>}
          {upcomingEvents.map((e) => (
            <div className="a-list-item" key={e.id}>
              <Calendar size={14} color="var(--text-soft)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13 }}>{e.title}</div>
                <div className="a-sub" style={{ margin: 0, fontSize: 11 }}>{e.date}{e.time ? ` · ${e.time}` : ""}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {topGoals.length > 0 && (
        <div className="a-card">
          <div className="a-row" style={{ marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>Tus metas financieras</h3>
            <button className="a-btn secondary" onClick={goToFinanzas} style={{ fontSize: 11.5 }}>Ver todas</button>
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {topGoals.map((g) => {
              const p = goalProgress(g);
              return (
                <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Ring pct={p.pct} color={p.pct >= 1 ? "var(--sage)" : "var(--butter)"} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{g.name}</div>
                    <div className="a-sub agenda-mono" style={{ margin: 0 }}>{formatCLP(p.current)} / {formatCLP(p.target)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= PRIORIDADES ================= */
function PrioridadesTab({ list, onAdd, onToggle, onDelete }) {
  const [val, setVal] = useState("");
  return (
    <div>
      <h1 className="a-h1 agenda-serif">Prioridades del día</h1>
      <p className="a-sub">Lo esencial de hoy, {new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}.</p>
      <div className="a-card">
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input className="a-input" placeholder="Añadir tarea..." value={val} onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { onAdd(val); setVal(""); } }} />
          <button className="a-btn" onClick={() => { onAdd(val); setVal(""); }}><Plus size={15} /></button>
        </div>
        {list.length === 0 && <p className="a-sub">Sin tareas todavía. Añade la primera arriba.</p>}
        {list.map((p) => (
          <div className="a-list-item" key={p.id}>
            <div className={`a-check ${p.done ? "done" : ""}`} onClick={() => onToggle(p.id)}>{p.done && <Check size={12} />}</div>
            <span style={{ flex: 1, textDecoration: p.done ? "line-through" : "none", color: p.done ? "var(--text-faint)" : "var(--text)" }}>{p.text}</span>
            <Trash2 size={14} color="var(--text-faint)" style={{ cursor: "pointer" }} onClick={() => onDelete(p.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= HABITOS (diario con cantidad/días, o meta semanal sin días fijos) ================= */
function HabitosTab({ data, patch }) {
  const [mode, setMode] = useState("daily");
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🌿");
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState("");
  const [days, setDays] = useState([1, 2, 3, 4, 5]);
  const [weeklyCount, setWeeklyCount] = useState(3);
  const today = todayISO();
  const weekStart = startOfWeek(today);

  const toggleDay = (d) => setDays((ds) => ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]);

  const addHabit = () => {
    if (!name.trim()) return;
    const base = { id: uid(), name, emoji, mode, unit: unit.trim(), log: {} };
    patch((d) => ({
      habits: [...d.habits, mode === "daily"
        ? { ...base, targetQty: qty || 1, targetDays: days.length ? days : [0,1,2,3,4,5,6] }
        : { ...base, targetCount: weeklyCount || 1 }],
    }));
    setName(""); setEmoji("🌿"); setQty(1); setUnit(""); setDays([1,2,3,4,5]); setWeeklyCount(3);
  };
  const removeHabit = (hid) => patch((d) => ({ habits: d.habits.filter((h) => h.id !== hid) }));

  const bumpWeekly = (hid, delta) => {
    patch((d) => ({ habits: d.habits.map((h) => h.id === hid ? { ...h, log: { ...h.log, [today]: Math.max(0, (h.log[today] || 0) + delta) } } : h) }));
  };

  const weekProgress = (h) => habitWeekProgress(h, today, weekStart);
  const [selectedDay, setSelectedDay] = useState({}); // { habitId: isoDate }

  return (
    <div>
      <h1 className="a-h1 agenda-serif">Hábitos</h1>
      <p className="a-sub">Hábitos diarios con días fijos (ej: agua, lectura, horario de trabajo) o metas semanales sin días fijos (ej: 3 rutinas a la semana).</p>

      <div className="a-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 14.5 }}>Nuevo hábito</h3>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button className={`a-btn ${mode === "daily" ? "" : "secondary"}`} style={{ fontSize: 12 }} onClick={() => setMode("daily")}>Diario con días fijos</button>
          <button className={`a-btn ${mode === "weekly" ? "" : "secondary"}`} style={{ fontSize: 12 }} onClick={() => setMode("weekly")}>Meta semanal (sin días fijos)</button>
        </div>

        <div className="a-grid a-grid-4" style={{ marginBottom: 10 }}>
          <input className="a-input" placeholder="Emoji" value={emoji} onChange={(e) => setEmoji(e.target.value)} />
          <input className="a-input" style={{ gridColumn: "span 2" }} placeholder="Nombre del hábito" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="a-input" placeholder="Unidad (ej: vasos, min)" value={unit} onChange={(e) => setUnit(e.target.value)} />
        </div>

        {mode === "daily" ? (
          <>
            <div className="a-grid a-grid-2" style={{ marginBottom: 10 }}>
              <input className="a-input" type="number" min={1} placeholder="Cantidad diaria (ej: 3 vasos, 30 min)" value={qty} onChange={(e) => setQty(parseInt(e.target.value) || 1)} />
            </div>
            <div className="a-stat-label">Días de la semana</div>
            <div style={{ display: "flex", gap: 6, margin: "6px 0 12px" }}>
              {WEEKDAYS_MON_FIRST.map((dNum) => (
                <div key={dNum} className={`a-daychip ${days.includes(dNum) ? "on" : ""}`} onClick={() => toggleDay(dNum)}>{WEEKDAYS[dNum]}</div>
              ))}
            </div>
          </>
        ) : (
          <div className="a-grid a-grid-2" style={{ marginBottom: 10 }}>
            <input className="a-input" type="number" min={1} placeholder="Veces por semana (ej: 3)" value={weeklyCount} onChange={(e) => setWeeklyCount(parseInt(e.target.value) || 1)} />
          </div>
        )}
        <button className="a-btn" onClick={addHabit}><Plus size={14} /> Crear hábito</button>
      </div>

      <div className="a-grid a-grid-2">
        {data.habits.map((h) => {
          const wp = weekProgress(h);
          const isWeekly = h.mode === "weekly";
          const isCheckbox = !isWeekly && h.targetQty === 1;
          const activeIso = selectedDay[h.id] || today;
          const activeQty = h.log[activeIso] || 0;
          const weeklyTarget = !isWeekly ? h.targetQty * h.targetDays.length : 0;

          const setQtyFor = (iso, val) => {
            patch((d) => ({ habits: d.habits.map((x) => x.id === h.id ? { ...x, log: { ...x.log, [iso]: Math.max(0, val) } } : x) }));
          };

          return (
            <div className="a-card" key={h.id}>
              <div className="a-row" style={{ alignItems: "flex-start" }}>
                <div style={{ display: "flex", gap: 12 }}>
                  <Ring pct={wp.pct} size={58} color={wp.pct >= 1 ? "var(--sage)" : "var(--butter)"} />
                  <div>
                    <div style={{ fontWeight: 600 }}>{h.emoji} {h.name}</div>
                    {isWeekly ? (
                      <div className="a-sub" style={{ margin: 0 }}>{wp.weekTotal}/{h.targetCount} {h.unit || "veces"} esta semana</div>
                    ) : (
                      <div className="a-sub" style={{ margin: 0 }}>{wp.done}/{wp.required} días completados esta semana</div>
                    )}
                  </div>
                </div>
                <Trash2 size={14} color="var(--text-faint)" style={{ cursor: "pointer" }} onClick={() => removeHabit(h.id)} />
              </div>
              <hr className="a-divider" />

              {isWeekly ? (
                <div className="a-row">
                  <span className="a-sub" style={{ margin: 0 }}>Esta semana</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button className="a-btn secondary xs" onClick={() => bumpWeekly(h.id, -1)}>−</button>
                    <span className="agenda-mono" style={{ minWidth: 50, textAlign: "center" }}>{wp.weekTotal}/{h.targetCount}</span>
                    <button className="a-btn secondary xs" onClick={() => bumpWeekly(h.id, 1)}>+</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="a-stat-label">Marca cada día por separado</div>
                  <div style={{ display: "flex", gap: 6, margin: "6px 0 12px" }}>
                    {WEEKDAYS_MON_FIRST.map((dNum) => {
                      const iso = toISO(addDays(weekStart, WEEKDAYS_MON_FIRST.indexOf(dNum)));
                      const isTarget = h.targetDays.includes(dNum);
                      const isFuture = iso > today;
                      const done = (h.log[iso] || 0) >= h.targetQty;
                      const isActive = activeIso === iso;
                      let style = {};
                      if (!isTarget) style = { opacity: 0.3 };
                      else if (isFuture) style = { opacity: 0.4, cursor: "not-allowed" };
                      return (
                        <div key={dNum}
                          className={`a-daychip ${done ? "on" : ""}`}
                          style={{ ...style, outline: isActive ? "2px solid var(--sage)" : "none", cursor: isTarget && !isFuture ? "pointer" : style.cursor }}
                          onClick={() => { if (isTarget && !isFuture) setSelectedDay((s) => ({ ...s, [h.id]: iso })); }}>
                          {WEEKDAYS[dNum]}
                        </div>
                      );
                    })}
                  </div>
                  <div className="a-row">
                    <span className="a-sub" style={{ margin: 0 }}>
                      {activeIso === today ? "Hoy" : new Date(activeIso + "T00:00:00").toLocaleDateString("es-CL", { weekday: "long", day: "numeric" })}
                    </span>
                    {isCheckbox ? (
                      <div className={`a-check ${activeQty >= 1 ? "done" : ""}`} style={{ width: 26, height: 26 }} onClick={() => setQtyFor(activeIso, activeQty >= 1 ? 0 : 1)}>
                        {activeQty >= 1 && <Check size={14} />}
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <button className="a-btn secondary xs" onClick={() => setQtyFor(activeIso, activeQty - 1)}>−</button>
                        <span className="agenda-mono" style={{ minWidth: 60, textAlign: "center" }}>{activeQty}/{h.targetQty} {h.unit}</span>
                        <button className="a-btn secondary xs" onClick={() => setQtyFor(activeIso, activeQty + 1)}>+</button>
                      </div>
                    )}
                  </div>
                  {h.targetQty > 1 && (
                    <div style={{ marginTop: 12 }}>
                      <div className="a-row" style={{ marginBottom: 4 }}>
                        <span className="a-sub" style={{ margin: 0 }}>Acumulado de la semana</span>
                        <span className="agenda-mono a-sub" style={{ margin: 0 }}>{wp.weekTotal}/{weeklyTarget} {h.unit} · {weeklyTarget ? Math.round((wp.weekTotal / weeklyTarget) * 100) : 0}%</span>
                      </div>
                      <div style={{ height: 6, background: "var(--line)", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${weeklyTarget ? Math.min(100, (wp.weekTotal / weeklyTarget) * 100) : 0}%`, background: "var(--butter)" }} />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================= FINANZAS ================= */
function FinanzasTab({ data, patch, month, setMonth, monthTx, ingresosMes, egresosMes, ahorroMes, retiroMes, balanceMes, goalProgress, pocketBalance, financeTab, setFinanceTab }) {
  const sub = [
    { id: "resumen", label: "Resumen" },
    { id: "movimientos", label: "Movimientos" },
    { id: "categorias", label: "Categorías" },
    { id: "metas", label: "Metas" },
    { id: "ahorros", label: "Ahorros" },
  ];
  return (
    <div>
      <div className="a-row" style={{ marginBottom: 4 }}>
        <div>
          <h1 className="a-h1 agenda-serif">Finanzas</h1>
          <p className="a-sub">Ingresos, egresos, ahorros, metas y categorías — todo por mes.</p>
        </div>
        <div className="a-monthnav">
          <button onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={15} /></button>
          <span className="agenda-mono" style={{ fontSize: 13, textTransform: "capitalize", minWidth: 130, textAlign: "center" }}>{monthLabel(month)}</span>
          <button onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={15} /></button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, margin: "18px 0", flexWrap: "wrap" }}>
        {sub.map((s) => (
          <button key={s.id} className={`a-btn ${financeTab === s.id ? "" : "secondary"}`} style={{ fontSize: 12 }} onClick={() => setFinanceTab(s.id)}>{s.label}</button>
        ))}
      </div>

      {financeTab === "resumen" && (
        <ResumenFinanzas ingresosMes={ingresosMes} egresosMes={egresosMes} ahorroMes={ahorroMes} retiroMes={retiroMes} balanceMes={balanceMes} data={data} goalProgress={goalProgress} />
      )}
      {financeTab === "movimientos" && <MovimientosFinanzas data={data} patch={patch} monthTx={monthTx} month={month} />}
      {financeTab === "categorias" && <CategoriasFinanzas data={data} patch={patch} />}
      {financeTab === "metas" && <MetasFinanzas data={data} patch={patch} goalProgress={goalProgress} />}
      {financeTab === "ahorros" && <AhorrosFinanzas data={data} patch={patch} pocketBalance={pocketBalance} />}
    </div>
  );
}

function ResumenFinanzas({ ingresosMes, egresosMes, ahorroMes, retiroMes, balanceMes, data, goalProgress }) {
  return (
    <div>
      <div className="a-grid a-grid-4" style={{ marginBottom: 18 }}>
        <div className="a-card">
          <div className="a-row"><TrendingUp size={15} color="var(--sage)" /><span className="a-pill in">Ingresos</span></div>
          <div className="a-stat-num agenda-mono" style={{ marginTop: 8 }}>{formatCLP(ingresosMes)}</div>
        </div>
        <div className="a-card">
          <div className="a-row"><TrendingDown size={15} color="var(--clay)" /><span className="a-pill out">Egresos</span></div>
          <div className="a-stat-num agenda-mono" style={{ marginTop: 8 }}>{formatCLP(egresosMes)}</div>
        </div>
        <div className="a-card">
          <div className="a-row"><PiggyBank size={15} color="var(--butter)" /><span className="a-pill ahorro">Ahorrado</span></div>
          <div className="a-stat-num agenda-mono" style={{ marginTop: 8 }}>{formatCLP(ahorroMes - retiroMes)}</div>
        </div>
        <div className="a-card">
          <div className="a-stat-label">Balance disponible</div>
          <div className="a-stat-num agenda-mono" style={{ color: balanceMes >= 0 ? "var(--sage)" : "var(--clay)" }}>{formatCLP(balanceMes)}</div>
        </div>
      </div>

      <div className="a-card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Progreso de metas este mes</h3>
        {data.goals.length === 0 && <p className="a-sub">Crea tu primera meta en la pestaña "Metas".</p>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 22, marginTop: 10 }}>
          {data.goals.map((g) => {
            const p = goalProgress(g);
            return (
              <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Ring pct={p.pct} color={p.pct >= 1 ? "var(--sage)" : "var(--butter)"} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{g.name}</div>
                  <div className="a-sub" style={{ margin: 0 }}>
                    {g.type === "mensual" ? `Mensual · ${g.category ? g.category : "todos los ingresos"}` : "Meta a plazo fijo"}
                  </div>
                  <div className="agenda-mono" style={{ fontSize: 12.5 }}>{formatCLP(p.current)} / {formatCLP(p.target)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MovimientosFinanzas({ data, patch, monthTx, month }) {
  const [type, setType] = useState("ingreso");
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(data.categories.ingreso[0] || "");
  const [pocketId, setPocketId] = useState(data.pockets[0]?.id || "");
  const [date, setDate] = useState(todayISO());

  const isPocketType = type === "ahorro" || type === "retiro";
  const cats = data.categories[type] || [];
  useEffect(() => { if (!isPocketType) setCategory((data.categories[type] || [])[0] || ""); }, [type]); // eslint-disable-line

  const addTx = () => {
    const amt = parseFloat(amount);
    if (!amt) return;
    if (isPocketType && !pocketId) return;
    if (!isPocketType && !concept.trim()) return;
    const finalConcept = isPocketType
      ? (concept.trim() || (type === "ahorro" ? "Aporte a ahorro" : "Retiro de ahorro"))
      : concept;
    patch((d) => ({
      transactions: [
        { id: uid(), type, concept: finalConcept, amount: amt, category: isPocketType ? "Ahorro" : category, date, pocketId: isPocketType ? pocketId : undefined },
        ...d.transactions,
      ],
    }));
    setConcept(""); setAmount("");
  };
  const delTx = (id) => patch((d) => ({ transactions: d.transactions.filter((t) => t.id !== id) }));

  const typeLabel = { ingreso: "↑ Ingreso", egreso: "↓ Egreso", ahorro: "🐷 Aporte a ahorro", retiro: "↩ Retiro de ahorro" };
  const pillClass = { ingreso: "in", egreso: "out", ahorro: "ahorro", retiro: "chip" };
  const pillIcon = { ingreso: "↑", egreso: "↓", ahorro: "🐷", retiro: "↩" };

  return (
    <div>
      <div className="a-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 14.5 }}>Registrar movimiento</h3>
        <div className="a-grid a-grid-2" style={{ marginBottom: 10 }}>
          <select className="a-select" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="ingreso">↑ Ingreso</option>
            <option value="egreso">↓ Egreso</option>
            <option value="ahorro">🐷 Aporte a ahorro</option>
            <option value="retiro">↩ Retiro de ahorro</option>
          </select>
          {isPocketType ? (
            <select className="a-select" value={pocketId} onChange={(e) => setPocketId(e.target.value)}>
              {data.pockets.length === 0 && <option value="">Crea un fondo primero en "Ahorros"</option>}
              {data.pockets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          ) : (
            <select className="a-select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>
        <div className="a-grid a-grid-3" style={{ marginBottom: 10 }}>
          <input className="a-input" placeholder={isPocketType ? "Concepto (opcional)" : "Concepto (ej: venta empanadas)"} value={concept} onChange={(e) => setConcept(e.target.value)} />
          <input className="a-input" type="number" placeholder="Monto" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input className="a-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <button className="a-btn" onClick={addTx}><Plus size={14} /> Agregar</button>
      </div>

      <div className="a-card">
        <h3 style={{ marginTop: 0, fontSize: 14.5 }}>Movimientos de {monthLabel(month)}</h3>
        {monthTx.length === 0 && <p className="a-sub">Sin movimientos este mes.</p>}
        {monthTx.map((t) => (
          <div className="a-list-item" key={t.id}>
            <span className={`a-pill ${pillClass[t.type]}`}>{pillIcon[t.type]}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5 }}>{t.concept}</div>
              <div className="a-sub" style={{ margin: 0, fontSize: 11.5 }}>
                {t.type === "ahorro" || t.type === "retiro" ? (data.pockets.find((p) => p.id === t.pocketId)?.name || "Ahorro") : t.category} · {t.date}
              </div>
            </div>
            <span className="agenda-mono" style={{ color: t.type === "ingreso" || t.type === "retiro" ? "var(--sage)" : "var(--clay)" }}>{formatCLP(t.amount)}</span>
            <Trash2 size={14} color="var(--text-faint)" style={{ cursor: "pointer" }} onClick={() => delTx(t.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoriasFinanzas({ data, patch }) {
  const [newIn, setNewIn] = useState("");
  const [newOut, setNewOut] = useState("");

  const addCat = (type, val, clear) => {
    if (!val.trim()) return;
    patch((d) => ({ categories: { ...d.categories, [type]: [...d.categories[type], val.trim()] } }));
    clear("");
  };
  const delCat = (type, cat) => {
    patch((d) => ({ categories: { ...d.categories, [type]: d.categories[type].filter((c) => c !== cat) } }));
  };

  return (
    <div className="a-grid a-grid-2">
      <div className="a-card">
        <h3 style={{ marginTop: 0, fontSize: 14.5 }}>Categorías de ingreso</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {data.categories.ingreso.map((c) => (
            <span key={c} className="a-pill chip" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {c} <X size={11} style={{ cursor: "pointer" }} onClick={() => delCat("ingreso", c)} />
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="a-input" placeholder="Nueva categoría..." value={newIn} onChange={(e) => setNewIn(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCat("ingreso", newIn, setNewIn)} />
          <button className="a-btn secondary icon" onClick={() => addCat("ingreso", newIn, setNewIn)}><Plus size={14} /></button>
        </div>
      </div>

      <div className="a-card">
        <h3 style={{ marginTop: 0, fontSize: 14.5 }}>Categorías de egreso</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {data.categories.egreso.map((c) => (
            <span key={c} className="a-pill chip" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {c} <X size={11} style={{ cursor: "pointer" }} onClick={() => delCat("egreso", c)} />
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="a-input" placeholder="Nueva categoría..." value={newOut} onChange={(e) => setNewOut(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCat("egreso", newOut, setNewOut)} />
          <button className="a-btn secondary icon" onClick={() => addCat("egreso", newOut, setNewOut)}><Plus size={14} /></button>
        </div>
      </div>
    </div>
  );
}

function MetasFinanzas({ data, patch, goalProgress }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("mensual");
  const [target, setTarget] = useState("");
  const [category, setCategory] = useState("");
  const [pocketId, setPocketId] = useState(data.pockets[0]?.id || "");

  const addGoal = () => {
    const t = parseFloat(target);
    if (!name.trim() || !t) return;
    patch((d) => ({
      goals: [...d.goals, type === "mensual" ? { id: uid(), name, type, target: t, category: category || null } : { id: uid(), name, type, target: t, pocketId: pocketId || null }],
    }));
    setName(""); setTarget("");
  };
  const delGoal = (id) => patch((d) => ({ goals: d.goals.filter((g) => g.id !== id) }));
  const setGoalCategory = (id, cat) => patch((d) => ({ goals: d.goals.map((g) => g.id === id ? { ...g, category: cat || null } : g) }));

  return (
    <div>
      <div className="a-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 14.5 }}>Nueva meta</h3>
        <p className="a-sub">Una meta <b>mensual</b> suma <b>todos tus ingresos del mes</b> por defecto — elige "Todos los ingresos" salvo que quieras seguir solo una categoría específica (ej. solo "Sueldo"). Una meta a <b>plazo fijo</b> se compara con el saldo de un fondo de ahorro.</p>
        <div className="a-grid a-grid-2" style={{ marginBottom: 10 }}>
          <input className="a-input" placeholder="Nombre de la meta" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="a-select" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="mensual">Meta mensual recurrente</option>
            <option value="fijo">Meta a plazo fijo (ligada a un ahorro)</option>
          </select>
        </div>
        <div className="a-grid a-grid-2" style={{ marginBottom: 10 }}>
          <input className="a-input" type="number" placeholder="Monto objetivo" value={target} onChange={(e) => setTarget(e.target.value)} />
          {type === "mensual" ? (
            <select className="a-select" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Todos los ingresos</option>
              {data.categories.ingreso.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          ) : (
            <select className="a-select" value={pocketId} onChange={(e) => setPocketId(e.target.value)}>
              <option value="">Sin fondo asignado aún</option>
              {data.pockets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>
        <button className="a-btn" onClick={addGoal}><Target size={14} /> Crear meta</button>
      </div>

      <div className="a-grid a-grid-2">
        {data.goals.map((g) => {
          const p = goalProgress(g);
          return (
            <div className="a-card" key={g.id}>
              <div className="a-row">
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <Ring pct={p.pct} color={p.pct >= 1 ? "var(--sage)" : "var(--butter)"} size={60} />
                  <div>
                    <div style={{ fontWeight: 600 }}>{g.name}</div>
                    <div className="a-sub" style={{ margin: 0 }}>{g.type === "mensual" ? "Mensual" : "Plazo fijo"}</div>
                    <div className="agenda-mono" style={{ fontSize: 12.5 }}>{formatCLP(p.current)} / {formatCLP(p.target)}</div>
                  </div>
                </div>
                <Trash2 size={14} color="var(--text-faint)" style={{ cursor: "pointer" }} onClick={() => delGoal(g.id)} />
              </div>
              {g.type === "mensual" && (
                <div style={{ marginTop: 10 }}>
                  <div className="a-stat-label">Toma como base</div>
                  <select className="a-select" value={g.category || ""} onChange={(e) => setGoalCategory(g.id, e.target.value)}>
                    <option value="">Todos los ingresos</option>
                    {data.categories.ingreso.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AhorrosFinanzas({ data, patch, pocketBalance }) {
  const [name, setName] = useState("");
  const [area, setArea] = useState("Personal");
  const [target, setTarget] = useState("");

  const addPocket = () => {
    if (!name.trim()) return;
    patch((d) => ({ pockets: [...d.pockets, { id: uid(), name, area, target: parseFloat(target) || 0 }] }));
    setName(""); setTarget("");
  };
  const delPocket = (id) => patch((d) => ({ pockets: d.pockets.filter((p) => p.id !== id) }));

  return (
    <div>
      <div className="a-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 14.5 }}>Nuevo fondo de ahorro</h3>
        <p className="a-sub">Crea fondos separados por área. Los aportes y retiros se registran desde "Movimientos".</p>
        <div className="a-grid a-grid-3" style={{ marginBottom: 10 }}>
          <input className="a-input" placeholder="Nombre (ej: Nuevo horno)" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="a-input" placeholder="Área (ej: SAN-ORGANIC)" value={area} onChange={(e) => setArea(e.target.value)} />
          <input className="a-input" type="number" placeholder="Meta (opcional)" value={target} onChange={(e) => setTarget(e.target.value)} />
        </div>
        <button className="a-btn" onClick={addPocket}><PiggyBank size={14} /> Crear fondo</button>
      </div>

      <div className="a-grid a-grid-2">
        {data.pockets.map((p) => {
          const current = pocketBalance(p.id);
          return (
            <div className="a-card" key={p.id}>
              <div className="a-row">
                <div>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div className="a-sub" style={{ margin: 0 }}>{p.area}</div>
                </div>
                <Trash2 size={14} color="var(--text-faint)" style={{ cursor: "pointer" }} onClick={() => delPocket(p.id)} />
              </div>
              <div className="agenda-mono" style={{ fontSize: 18, margin: "10px 0 2px", fontWeight: 600 }}>
                {formatCLP(current)}{p.target ? <span className="a-sub" style={{ fontSize: 13 }}> / {formatCLP(p.target)}</span> : null}
              </div>
              {p.target > 0 && (
                <div style={{ height: 6, background: "var(--line)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(100, (current / p.target) * 100)}%`, background: "var(--sage)" }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================= OBJETIVOS (metas no monetarias) ================= */
function ObjetivosTab({ data, patch }) {
  const [title, setTitle] = useState("");
  const [area, setArea] = useState("Personal");
  const [dueDate, setDueDate] = useState("");
  const [milestoneDraft, setMilestoneDraft] = useState({});

  const addObjective = () => {
    if (!title.trim()) return;
    patch((d) => ({ objectives: [...d.objectives, { id: uid(), title, area, dueDate, milestones: [] }] }));
    setTitle(""); setDueDate("");
  };
  const delObjective = (id) => patch((d) => ({ objectives: d.objectives.filter((o) => o.id !== id) }));
  const addMilestone = (obj) => {
    const text = (milestoneDraft[obj.id] || "").trim();
    if (!text) return;
    patch((d) => ({ objectives: d.objectives.map((o) => o.id === obj.id ? { ...o, milestones: [...o.milestones, { id: uid(), text, done: false }] } : o) }));
    setMilestoneDraft((m) => ({ ...m, [obj.id]: "" }));
  };
  const toggleMilestone = (objId, msId) => {
    patch((d) => ({ objectives: d.objectives.map((o) => o.id === objId ? { ...o, milestones: o.milestones.map((m) => m.id === msId ? { ...m, done: !m.done } : m) } : o) }));
  };
  const delMilestone = (objId, msId) => {
    patch((d) => ({ objectives: d.objectives.map((o) => o.id === objId ? { ...o, milestones: o.milestones.filter((m) => m.id !== msId) } : o) }));
  };

  return (
    <div>
      <h1 className="a-h1 agenda-serif">Metas y objetivos</h1>
      <p className="a-sub">Todo lo que quieres lograr que no se mide en dinero.</p>

      <div className="a-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 14.5 }}>Nuevo objetivo</h3>
        <div className="a-grid a-grid-3" style={{ marginBottom: 10 }}>
          <input className="a-input" placeholder="Ej: Aprender pan de masa madre" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="a-input" placeholder="Área (ej: Personal, Salud)" value={area} onChange={(e) => setArea(e.target.value)} />
          <input className="a-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <button className="a-btn" onClick={addObjective}><Flag size={14} /> Crear objetivo</button>
      </div>

      <div className="a-grid a-grid-2">
        {data.objectives.map((o) => {
          const done = o.milestones.filter((m) => m.done).length;
          const total = o.milestones.length;
          const pct = total ? done / total : 0;
          return (
            <div className="a-card" key={o.id}>
              <div className="a-row" style={{ alignItems: "flex-start" }}>
                <div style={{ display: "flex", gap: 12 }}>
                  <Ring pct={pct} color={pct >= 1 ? "var(--sage)" : "var(--butter)"} size={56} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{o.title}</div>
                    <div className="a-sub" style={{ margin: 0 }}>{o.area}{o.dueDate ? ` · para ${o.dueDate}` : ""}</div>
                    <div className="a-sub" style={{ margin: 0 }}>{done}/{total} hitos</div>
                  </div>
                </div>
                <Trash2 size={14} color="var(--text-faint)" style={{ cursor: "pointer" }} onClick={() => delObjective(o.id)} />
              </div>
              <hr className="a-divider" />
              {o.milestones.map((m) => (
                <div className="a-list-item" key={m.id}>
                  <div className={`a-check ${m.done ? "done" : ""}`} onClick={() => toggleMilestone(o.id, m.id)}>{m.done && <Check size={12} />}</div>
                  <span style={{ flex: 1, fontSize: 13, textDecoration: m.done ? "line-through" : "none", color: m.done ? "var(--text-faint)" : "var(--text)" }}>{m.text}</span>
                  <Trash2 size={13} color="var(--text-faint)" style={{ cursor: "pointer" }} onClick={() => delMilestone(o.id, m.id)} />
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <input className="a-input" placeholder="Añadir hito..." value={milestoneDraft[o.id] || ""}
                  onChange={(e) => setMilestoneDraft((m) => ({ ...m, [o.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && addMilestone(o)} />
                <button className="a-btn secondary icon" onClick={() => addMilestone(o)}><Plus size={14} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================= PROYECTOS ================= */
const PROJECT_STATUSES = [
  { id: "planificacion", label: "Planificación" },
  { id: "en_curso", label: "En curso" },
  { id: "pausado", label: "Pausado" },
  { id: "completado", label: "Completado" },
];

function ProyectosTab({ data, patch }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [taskDraft, setTaskDraft] = useState({});

  const addProject = () => {
    if (!name.trim()) return;
    patch((d) => ({ projects: [...d.projects, { id: uid(), name, description, status: "planificacion", deadline, tasks: [] }] }));
    setName(""); setDescription(""); setDeadline("");
  };
  const delProject = (id) => patch((d) => ({ projects: d.projects.filter((p) => p.id !== id) }));
  const setStatus = (id, status) => patch((d) => ({ projects: d.projects.map((p) => p.id === id ? { ...p, status } : p) }));
  const addTask = (proj) => {
    const text = (taskDraft[proj.id] || "").trim();
    if (!text) return;
    patch((d) => ({ projects: d.projects.map((p) => p.id === proj.id ? { ...p, tasks: [...p.tasks, { id: uid(), text, done: false }] } : p) }));
    setTaskDraft((t) => ({ ...t, [proj.id]: "" }));
  };
  const toggleTask = (projId, taskId) => {
    patch((d) => ({ projects: d.projects.map((p) => p.id === projId ? { ...p, tasks: p.tasks.map((t) => t.id === taskId ? { ...t, done: !t.done } : t) } : p) }));
  };
  const delTask = (projId, taskId) => {
    patch((d) => ({ projects: d.projects.map((p) => p.id === projId ? { ...p, tasks: p.tasks.filter((t) => t.id !== taskId) } : p) }));
  };

  return (
    <div>
      <h1 className="a-h1 agenda-serif">Proyectos</h1>
      <p className="a-sub">Iniciativas con varios pasos.</p>

      <div className="a-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 14.5 }}>Nuevo proyecto</h3>
        <div className="a-grid a-grid-2" style={{ marginBottom: 10 }}>
          <input className="a-input" placeholder="Nombre del proyecto" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="a-input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
        <input className="a-input" placeholder="Descripción breve (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} style={{ marginBottom: 10 }} />
        <button className="a-btn" onClick={addProject}><FolderKanban size={14} /> Crear proyecto</button>
      </div>

      <div className="a-grid a-grid-2">
        {data.projects.map((p) => {
          const done = p.tasks.filter((t) => t.done).length;
          const total = p.tasks.length;
          return (
            <div className="a-card" key={p.id}>
              <div className="a-row" style={{ alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14.5 }}>{p.name}</div>
                  {p.description && <div className="a-sub" style={{ margin: "2px 0" }}>{p.description}</div>}
                  {p.deadline && <div className="a-sub" style={{ margin: 0 }}>Fecha límite: {p.deadline}</div>}
                </div>
                <Trash2 size={14} color="var(--text-faint)" style={{ cursor: "pointer" }} onClick={() => delProject(p.id)} />
              </div>
              <select className="a-select" value={p.status} onChange={(e) => setStatus(p.id, e.target.value)} style={{ margin: "10px 0" }}>
                {PROJECT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <div className="a-sub" style={{ margin: "0 0 6px" }}>{done}/{total} tareas completadas</div>
              {total > 0 && (
                <div style={{ height: 6, background: "var(--line)", borderRadius: 4, overflow: "hidden", marginBottom: 10 }}>
                  <div style={{ height: "100%", width: `${(done / total) * 100}%`, background: "var(--sage)" }} />
                </div>
              )}
              {p.tasks.map((t) => (
                <div className="a-list-item" key={t.id}>
                  <div className={`a-check ${t.done ? "done" : ""}`} onClick={() => toggleTask(p.id, t.id)}>{t.done && <Check size={12} />}</div>
                  <span style={{ flex: 1, fontSize: 13, textDecoration: t.done ? "line-through" : "none", color: t.done ? "var(--text-faint)" : "var(--text)" }}>{t.text}</span>
                  <Trash2 size={13} color="var(--text-faint)" style={{ cursor: "pointer" }} onClick={() => delTask(p.id, t.id)} />
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <input className="a-input" placeholder="Añadir tarea..." value={taskDraft[p.id] || ""}
                  onChange={(e) => setTaskDraft((t) => ({ ...t, [p.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && addTask(p)} />
                <button className="a-btn secondary icon" onClick={() => addTask(p)}><Plus size={14} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================= COMIDAS + RECETAS ================= */
const MEAL_SLOTS = [
  { id: "desayuno", label: "Desayuno" },
  { id: "almuerzo", label: "Almuerzo" },
  { id: "cena", label: "Cena" },
  { id: "snack", label: "Snack" },
];

function ComidasTab({ data, patch }) {
  const [date, setDate] = useState(todayISO());
  const [sub, setSub] = useState("comidas");
  const [highlightRecipe, setHighlightRecipe] = useState(null);
  const dayMeals = data.meals[date] || {};

  const setMeal = (slot, field, value) => {
    patch((d) => ({
      meals: {
        ...d.meals,
        [date]: { ...(d.meals[date] || {}), [slot]: { ...((d.meals[date] || {})[slot] || {}), [field]: value } },
      },
    }));
  };

  const goToRecipe = (recipeId) => { setHighlightRecipe(recipeId); setSub("recetas"); };

  return (
    <div>
      <div className="a-row" style={{ marginBottom: 4 }}>
        <div>
          <h1 className="a-h1 agenda-serif">Comidas</h1>
          <p className="a-sub">Registra lo que comes y enlázalo con tus recetas.</p>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, margin: "0 0 16px" }}>
        <button className={`a-btn ${sub === "comidas" ? "" : "secondary"}`} style={{ fontSize: 12 }} onClick={() => setSub("comidas")}>Registro diario</button>
        <button className={`a-btn ${sub === "recetas" ? "" : "secondary"}`} style={{ fontSize: 12 }} onClick={() => { setHighlightRecipe(null); setSub("recetas"); }}>Recetas</button>
      </div>

      {sub === "comidas" && (
        <div>
          <input className="a-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 180, marginBottom: 16 }} />
          <div className="a-grid a-grid-2">
            {MEAL_SLOTS.map((slot) => {
              const entry = dayMeals[slot.id] || {};
              return (
                <div className="a-card" key={slot.id}>
                  <h3 style={{ marginTop: 0, fontSize: 14.5 }}>{slot.label}</h3>
                  <select className="a-select" value={entry.recipeId || ""} style={{ marginBottom: 8 }}
                    onChange={(e) => {
                      const r = data.recipes.find((r) => r.id === e.target.value);
                      setMeal(slot.id, "recipeId", e.target.value);
                      if (r) setMeal(slot.id, "text", r.name);
                    }}>
                    <option value="">Sin receta vinculada</option>
                    {data.recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <input className="a-input" placeholder="¿Qué comiste?" value={entry.text || ""} onChange={(e) => setMeal(slot.id, "text", e.target.value)} style={{ marginBottom: entry.recipeId ? 8 : 0 }} />
                  {entry.recipeId && (
                    <button className="a-btn secondary xs" onClick={() => goToRecipe(entry.recipeId)}><ChefHat size={12} /> Ver receta</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {sub === "recetas" && (
        <RecetasPanel data={data} patch={patch} highlightId={highlightRecipe}
          onGoToMeal={(mealDate) => { setDate(mealDate); setSub("comidas"); }} />
      )}
    </div>
  );
}

function RecetasPanel({ data, patch, highlightId, onGoToMeal }) {
  const [name, setName] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [steps, setSteps] = useState("");
  const [link, setLink] = useState("");

  const addRecipe = () => {
    if (!name.trim()) return;
    patch((d) => ({ recipes: [...d.recipes, { id: uid(), name, ingredients, steps, link }] }));
    setName(""); setIngredients(""); setSteps(""); setLink("");
  };
  const delRecipe = (id) => patch((d) => ({ recipes: d.recipes.filter((r) => r.id !== id) }));

  const mealsUsingRecipe = (recipeId) => {
    const usages = [];
    Object.entries(data.meals || {}).forEach(([date, slots]) => {
      Object.entries(slots || {}).forEach(([slotId, entry]) => {
        if (entry?.recipeId === recipeId) {
          const label = MEAL_SLOTS.find((s) => s.id === slotId)?.label || slotId;
          usages.push({ date, label });
        }
      });
    });
    return usages.sort((a, b) => b.date.localeCompare(a.date));
  };

  return (
    <div>
      <div className="a-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 14.5 }}>Nueva receta</h3>
        <input className="a-input" placeholder="Nombre de la receta" value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 8 }} />
        <textarea className="a-input" rows={2} placeholder="Ingredientes..." value={ingredients} onChange={(e) => setIngredients(e.target.value)} style={{ marginBottom: 8, fontFamily: "inherit" }} />
        <textarea className="a-input" rows={2} placeholder="Preparación..." value={steps} onChange={(e) => setSteps(e.target.value)} style={{ marginBottom: 8, fontFamily: "inherit" }} />
        <input className="a-input" placeholder="Link de la receta (opcional, ej: video o blog)" value={link} onChange={(e) => setLink(e.target.value)} style={{ marginBottom: 8 }} />
        <button className="a-btn" onClick={addRecipe}><ChefHat size={14} /> Guardar receta</button>
      </div>
      <div className="a-grid a-grid-2">
        {data.recipes.map((r) => {
          const usages = mealsUsingRecipe(r.id);
          return (
            <div className="a-card" key={r.id} style={{ border: highlightId === r.id ? "2px solid var(--sage)" : "1px solid var(--line)" }}>
              <div className="a-row"><div style={{ fontWeight: 600 }}>{r.name}</div>
                <Trash2 size={14} color="var(--text-faint)" style={{ cursor: "pointer" }} onClick={() => delRecipe(r.id)} />
              </div>
              {r.ingredients && <div className="a-sub" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}><b>Ingredientes:</b> {r.ingredients}</div>}
              {r.steps && <div className="a-sub" style={{ marginTop: 4, whiteSpace: "pre-wrap" }}><b>Preparación:</b> {r.steps}</div>}
              {r.link && <div style={{ marginTop: 6 }}><a href={r.link} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: "var(--sage)" }}>Ver receta original ↗</a></div>}
              {usages.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div className="a-stat-label">Usada en Comidas</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                    {usages.map((u, i) => (
                      <span key={i} className="a-pill chip" style={{ cursor: "pointer" }} onClick={() => onGoToMeal(u.date)}>{u.date} · {u.label}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================= ENTRENAMIENTO ================= */
function EntrenamientoTab({ data, patch }) {
  const [date, setDate] = useState(todayISO());
  const [type, setType] = useState("");
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");

  const addWorkout = () => {
    if (!type.trim()) return;
    patch((d) => ({ workouts: [{ id: uid(), date, type, duration: parseInt(duration) || 0, notes }, ...d.workouts] }));
    setType(""); setDuration(""); setNotes("");
  };
  const delWorkout = (id) => patch((d) => ({ workouts: d.workouts.filter((w) => w.id !== id) }));

  return (
    <div>
      <h1 className="a-h1 agenda-serif">Entrenamiento</h1>
      <p className="a-sub">Registro de actividad física.</p>
      <div className="a-card" style={{ marginBottom: 16 }}>
        <div className="a-grid a-grid-3" style={{ marginBottom: 10 }}>
          <input className="a-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input className="a-input" placeholder="Tipo (ej: Fuerza, Cardio)" value={type} onChange={(e) => setType(e.target.value)} />
          <input className="a-input" type="number" placeholder="Duración (min)" value={duration} onChange={(e) => setDuration(e.target.value)} />
        </div>
        <input className="a-input" placeholder="Notas (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ marginBottom: 10 }} />
        <button className="a-btn" onClick={addWorkout}><Dumbbell size={14} /> Registrar</button>
      </div>
      <div className="a-card">
        {data.workouts.length === 0 && <p className="a-sub">Sin entrenamientos registrados.</p>}
        {data.workouts.map((w) => (
          <div className="a-list-item" key={w.id}>
            <Dumbbell size={14} color="var(--text-soft)" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5 }}>{w.type} · {w.duration} min</div>
              <div className="a-sub" style={{ margin: 0, fontSize: 11.5 }}>{w.date}{w.notes ? ` · ${w.notes}` : ""}</div>
            </div>
            <Trash2 size={14} color="var(--text-faint)" style={{ cursor: "pointer" }} onClick={() => delWorkout(w.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= DIARIO (tarjetas de colores como Notas, sin bug de emojis, historial completo) ================= */
const MOODS = ["😊", "😌", "😐", "😔", "😤", "🥳"];
const MOOD_LABELS = { "😊": "Alegre", "😌": "Tranquilo", "😐": "Neutral", "😔": "Triste", "😤": "Frustrado", "🥳": "Feliz" };
const MOOD_COLORS = { "😊": "#fde9c8", "😌": "#e3f0d8", "😐": "#dceaf7", "😔": "#ece0f7", "😤": "#fbe3ea", "🥳": "#fde9c8" };

function DiarioTab({ data, patch }) {
  const [date, setDate] = useState(todayISO());
  const [expanded, setExpanded] = useState(null);
  const entry = data.journal[date] || { mood: "", reflection: "", text: "" };

  const updateField = (field, val) => {
    patch((d) => ({
      journal: {
        ...d.journal,
        [date]: { ...(d.journal[date] || { mood: "", reflection: "", text: "" }), [field]: val },
      },
    }));
  };

  const pastEntries = useMemo(() => {
    return Object.entries(data.journal)
      .filter(([d]) => d <= todayISO() && d !== date)
      .sort((a, b) => b[0].localeCompare(a[0]));
  }, [data.journal, date]);

  const moodCounts = useMemo(() => {
    const counts = {};
    Object.values(data.journal).forEach((e) => { if (e.mood) counts[e.mood] = (counts[e.mood] || 0) + 1; });
    return counts;
  }, [data.journal]);

  return (
    <div>
      <h1 className="a-h1 agenda-serif">Diario personal</h1>
      <p className="a-sub">Escribiendo el {new Date(date + "T00:00:00").toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}</p>

      <div className="a-card" style={{ marginBottom: 16, background: entry.mood ? MOOD_COLORS[entry.mood] : "#fff" }}>
        <input className="a-input" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 180, marginBottom: 14, background: "rgba(255,255,255,0.6)" }} />

        <div style={{ marginBottom: 14 }}>
          <div className="a-stat-label">¿Cómo te sientes hoy?</div>
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            {MOODS.map((m) => (
              <button key={m} type="button" onClick={() => updateField("mood", m)}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, fontSize: 20, background: entry.mood === m ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)", border: entry.mood === m ? "1px solid var(--sage)" : "1px solid var(--line)", borderRadius: 10, padding: "6px 8px", cursor: "pointer" }}>
                {m}
                <span style={{ fontSize: 9.5, fontWeight: 600, color: "var(--text-soft)" }}>{MOOD_LABELS[m]}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div className="a-stat-label">¿Qué quieres recordar de hoy?</div>
          <input className="a-input" value={entry.reflection} onChange={(e) => updateField("reflection", e.target.value)} style={{ background: "rgba(255,255,255,0.7)" }} />
        </div>

        <div>
          <div className="a-stat-label">Notas del día</div>
          <textarea className="a-input" rows={5} value={entry.text} onChange={(e) => updateField("text", e.target.value)} style={{ resize: "vertical", fontFamily: "inherit", background: "rgba(255,255,255,0.7)" }} />
        </div>
      </div>

      {Object.keys(moodCounts).length > 0 && (
        <div className="a-card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0, fontSize: 14.5 }}>Cómo te has sentido</h3>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            {Object.entries(moodCounts).map(([m, c]) => (
              <div key={m} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 22 }}>{m}</div>
                <div className="a-sub" style={{ margin: 0, fontWeight: 600 }}>{MOOD_LABELS[m]}</div>
                <div className="agenda-mono a-sub" style={{ margin: 0 }}>{c} día{c !== 1 ? "s" : ""}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <h3 style={{ fontSize: 14.5, margin: "0 0 12px" }}>Entradas anteriores</h3>
      {pastEntries.length === 0 && <p className="a-sub">Aún no tienes otras entradas guardadas.</p>}
      <div className="a-grid a-grid-3">
        {pastEntries.map(([d, e]) => (
          <div className="a-note" key={d} style={{ background: e.mood ? MOOD_COLORS[e.mood] : "#fff", border: "1px solid var(--line)", cursor: "pointer" }}
            onClick={() => setExpanded(expanded === d ? null : d)}>
            <div className="a-row" style={{ alignItems: "flex-start" }}>
              <span style={{ fontSize: 20 }}>{e.mood || "•"}</span>
              <div style={{ flex: 1, textAlign: "right" }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{d}</div>
                <Pencil size={12} color="var(--text-soft)" style={{ cursor: "pointer" }} onClick={(ev) => { ev.stopPropagation(); setDate(d); }} />
              </div>
            </div>
            {e.reflection && <p style={{ fontSize: 12.5, marginTop: 8, marginBottom: 4, fontWeight: 600 }}>{e.reflection}</p>}
            <p style={{ fontSize: 12, marginTop: 4, whiteSpace: "pre-wrap", color: "var(--text-soft)" }}>
              {expanded === d ? (e.text || "Sin notas adicionales.") : (e.text ? e.text.slice(0, 90) + (e.text.length > 90 ? "…" : "") : "Sin notas adicionales.")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= NOTAS (estilo Keep: color, etiquetas, checklist, edición) ================= */
const NOTE_COLORS = ["#ffffff", "#fbe3ea", "#fde9c8", "#e3f0d8", "#dceaf7", "#ece0f7"];

function NotasTab({ data, patch }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [color, setColor] = useState(NOTE_COLORS[0]);
  const [tags, setTags] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [filterTag, setFilterTag] = useState("");

  const addNote = () => {
    if (!title.trim()) return;
    patch((d) => ({
      notes: [{ id: uid(), title, content, date: todayISO(), color, done: false, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) }, ...d.notes],
    }));
    setTitle(""); setContent(""); setColor(NOTE_COLORS[0]); setTags("");
  };
  const delNote = (id) => patch((d) => ({ notes: d.notes.filter((n) => n.id !== id) }));
  const toggleDone = (id) => patch((d) => ({ notes: d.notes.map((n) => n.id === id ? { ...n, done: !n.done } : n) }));
  const updateNote = (id, fields) => patch((d) => ({ notes: d.notes.map((n) => n.id === id ? { ...n, ...fields } : n) }));

  const allTags = [...new Set(data.notes.flatMap((n) => n.tags || []))];
  const visibleNotes = filterTag ? data.notes.filter((n) => (n.tags || []).includes(filterTag)) : data.notes;

  return (
    <div>
      <h1 className="a-h1 agenda-serif">Notas</h1>
      <p className="a-sub">Ideas, recordatorios, checklists — con color y etiquetas.</p>

      <div className="a-card" style={{ marginBottom: 16 }}>
        <input className="a-input" placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} style={{ marginBottom: 8 }} />
        <textarea className="a-input" rows={3} placeholder="Contenido..." value={content} onChange={(e) => setContent(e.target.value)} style={{ marginBottom: 8, fontFamily: "inherit" }} />
        <input className="a-input" placeholder="Etiquetas separadas por coma (ej: negocio, ideas)" value={tags} onChange={(e) => setTags(e.target.value)} style={{ marginBottom: 10 }} />
        <div className="a-row">
          <div style={{ display: "flex", gap: 6 }}>
            {NOTE_COLORS.map((c) => (
              <div key={c} onClick={() => setColor(c)} style={{ width: 22, height: 22, borderRadius: "50%", background: c, border: color === c ? "2px solid var(--sage)" : "1px solid var(--line)", cursor: "pointer" }} />
            ))}
          </div>
          <button className="a-btn" onClick={addNote}><Plus size={14} /> Guardar nota</button>
        </div>
      </div>

      {allTags.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <span className={`a-pill ${filterTag === "" ? "in" : "chip"}`} style={{ cursor: "pointer" }} onClick={() => setFilterTag("")}>Todas</span>
          {allTags.map((t) => (
            <span key={t} className={`a-pill ${filterTag === t ? "in" : "chip"}`} style={{ cursor: "pointer" }} onClick={() => setFilterTag(t)}>{t}</span>
          ))}
        </div>
      )}

      <div className="a-grid a-grid-3">
        {visibleNotes.map((n) => (
          <div className="a-note" key={n.id} style={{ background: n.color || "#fff", border: "1px solid var(--line)" }}>
            {editingId === n.id ? (
              <>
                <input className="a-input" value={n.title} onChange={(e) => updateNote(n.id, { title: e.target.value })} style={{ marginBottom: 6, background: "rgba(255,255,255,0.6)" }} />
                <textarea className="a-input" rows={3} value={n.content} onChange={(e) => updateNote(n.id, { content: e.target.value })} style={{ marginBottom: 6, background: "rgba(255,255,255,0.6)", fontFamily: "inherit" }} />
                <button className="a-btn xs" onClick={() => setEditingId(null)}><Check size={12} /> Listo</button>
              </>
            ) : (
              <>
                <div className="a-row" style={{ alignItems: "flex-start" }}>
                  <div className={`a-check ${n.done ? "done" : ""}`} onClick={() => toggleDone(n.id)}>{n.done && <Check size={12} />}</div>
                  <div style={{ flex: 1, fontWeight: 600, textDecoration: n.done ? "line-through" : "none" }}>{n.title}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Pencil size={13} color="var(--text-soft)" style={{ cursor: "pointer" }} onClick={() => setEditingId(n.id)} />
                    <Trash2 size={13} color="var(--text-faint)" style={{ cursor: "pointer" }} onClick={() => delNote(n.id)} />
                  </div>
                </div>
                <p style={{ fontSize: 13, marginTop: 8, whiteSpace: "pre-wrap", flex: 1, textDecoration: n.done ? "line-through" : "none", color: n.done ? "var(--text-faint)" : "var(--text)" }}>{n.content}</p>
                {n.tags && n.tags.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                    {n.tags.map((t) => <span key={t} className="a-tag">{t}</span>)}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= CALENDARIO (semana / mes, con horarios) ================= */
function CalendarioTab({ data, patch }) {
  const [view, setView] = useState("semana");
  const [refDate, setRefDate] = useState(todayISO());
  const [mobileDay, setMobileDay] = useState(todayISO());
  const [formDate, setFormDate] = useState(todayISO());
  const [time, setTime] = useState("");
  const [title, setTitle] = useState("");
  const [startHour, setStartHour] = useState(8);
  const [endHour, setEndHour] = useState(20);

  const addEvent = (presetTime) => {
    if (!title.trim()) return;
    patch((d) => ({
      calendarEvents: { ...(d.calendarEvents || {}), [formDate]: [...((d.calendarEvents || {})[formDate] || []), { id: uid(), title, time: presetTime ?? time }] },
    }));
    setTitle(""); setTime("");
  };
  const delEvent = (date, id) => {
    patch((d) => ({ calendarEvents: { ...(d.calendarEvents || {}), [date]: (d.calendarEvents?.[date] || []).filter((e) => e.id !== id) } }));
  };
  const quickAdd = (iso, hour) => {
    const t = prompt(`Nuevo evento el ${iso} a las ${String(hour).padStart(2, "0")}:00 — escribe el título:`);
    if (!t || !t.trim()) return;
    patch((d) => ({
      calendarEvents: { ...(d.calendarEvents || {}), [iso]: [...((d.calendarEvents || {})[iso] || []), { id: uid(), title: t.trim(), time: `${String(hour).padStart(2, "0")}:00` }] },
    }));
  };

  const weekStart = startOfWeek(refDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => toISO(addDays(weekStart, i)));

  const monthDate = new Date(refDate + "T00:00:00");
  const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthGridStart = startOfWeek(toISO(firstOfMonth));
  const monthCells = Array.from({ length: 42 }, (_, i) => addDays(monthGridStart, i));

  const eventsFor = (iso) => (data.calendarEvents?.[iso] || []).slice().sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const hours = [];
  for (let h = startHour; h <= endHour; h++) hours.push(h);
  const pad2 = (n) => String(n).padStart(2, "0");
  const eventsAtHour = (iso, h) => eventsFor(iso).filter((e) => e.time && parseInt(e.time.split(":")[0], 10) === h);
  const untimedEvents = (iso) => eventsFor(iso).filter((e) => !e.time);

  return (
    <div>
      <div className="a-row" style={{ marginBottom: 4 }}>
        <div>
          <h1 className="a-h1 agenda-serif">Agenda / Calendario</h1>
          <p className="a-sub">Vista semanal y mensual con horarios.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={`a-btn ${view === "semana" ? "" : "secondary"}`} style={{ fontSize: 12 }} onClick={() => setView("semana")}>Semana</button>
          <button className={`a-btn ${view === "mes" ? "" : "secondary"}`} style={{ fontSize: 12 }} onClick={() => setView("mes")}>Mes</button>
        </div>
      </div>

      <div className="a-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 14.5 }}>Nuevo evento</h3>
        <div className="a-grid a-grid-3" style={{ marginBottom: 10 }}>
          <input className="a-input" type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
          <input className="a-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          <input className="a-input" placeholder="Título del evento" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addEvent()} />
        </div>
        <button className="a-btn" onClick={() => addEvent()}><Plus size={14} /> Agregar evento</button>
      </div>

      {view === "semana" && (
        <div className="a-card" style={{ marginBottom: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span className="a-sub" style={{ margin: 0 }}>Rango horario:</span>
          <select className="a-select" style={{ width: "auto" }} value={startHour} onChange={(e) => setStartHour(parseInt(e.target.value))}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{pad2(h)}:00</option>)}
          </select>
          <span className="a-sub" style={{ margin: 0 }}>a</span>
          <select className="a-select" style={{ width: "auto" }} value={endHour} onChange={(e) => setEndHour(parseInt(e.target.value))}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{pad2(h)}:00</option>)}
          </select>
        </div>
      )}

      <div className="a-monthnav" style={{ marginBottom: 12 }}>
        <button onClick={() => setRefDate(toISO(addDays(new Date(refDate + "T00:00:00"), view === "semana" ? -7 : -30)))}><ChevronLeft size={15} /></button>
        <span className="agenda-mono" style={{ fontSize: 13, textTransform: "capitalize" }}>
          {view === "semana" ? `Semana del ${weekDays[0]}` : monthLabel(monthKey(refDate))}
        </span>
        <button onClick={() => setRefDate(toISO(addDays(new Date(refDate + "T00:00:00"), view === "semana" ? 7 : 30)))}><ChevronRight size={15} /></button>
      </div>

      {view === "semana" && (
        <>
          {/* Grilla por horario — computador / tablet */}
          <div className="a-hourgrid-desktop">
            <div className="a-hourgrid" style={{ gridTemplateColumns: `64px repeat(7,1fr)` }}>
              <div className="a-hourgrid-corner" />
              {weekDays.map((iso) => (
                <div key={iso} className="a-hourgrid-daylabel">{WEEKDAYS[new Date(iso + "T00:00:00").getDay()]} {iso.slice(8)}</div>
              ))}

              <div className="a-hourgrid-hourlabel">Todo el día</div>
              {weekDays.map((iso) => (
                <div key={iso} className="a-hourgrid-cell" onClick={() => setFormDate(iso)}>
                  {untimedEvents(iso).map((e) => (
                    <div key={e.id} className="a-hourgrid-event" onClick={(ev) => { ev.stopPropagation(); delEvent(iso, e.id); }} title="Clic para eliminar">{e.title}</div>
                  ))}
                </div>
              ))}

              {hours.map((h) => (
                <React.Fragment key={h}>
                  <div className="a-hourgrid-hourlabel">{pad2(h)}:00</div>
                  {weekDays.map((iso) => (
                    <div key={iso} className="a-hourgrid-cell" onClick={() => quickAdd(iso, h)} title="Clic para agregar un evento">
                      {eventsAtHour(iso, h).map((e) => (
                        <div key={e.id} className="a-hourgrid-event" onClick={(ev) => { ev.stopPropagation(); delEvent(iso, e.id); }} title="Clic para eliminar">{e.time} {e.title}</div>
                      ))}
                    </div>
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Agenda del día — celular */}
          <div className="a-daygrid-mobile">
            <div className="a-monthnav" style={{ marginBottom: 12 }}>
              <button onClick={() => setMobileDay(toISO(addDays(new Date(mobileDay + "T00:00:00"), -1)))}><ChevronLeft size={15} /></button>
              <span className="agenda-mono" style={{ fontSize: 13, textTransform: "capitalize" }}>
                {new Date(mobileDay + "T00:00:00").toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "short" })}
              </span>
              <button onClick={() => setMobileDay(toISO(addDays(new Date(mobileDay + "T00:00:00"), 1)))}><ChevronRight size={15} /></button>
            </div>
            {untimedEvents(mobileDay).length > 0 && (
              <div className="a-card" style={{ marginBottom: 10, padding: 10 }}>
                <div className="a-sub" style={{ fontWeight: 700, margin: "0 0 6px" }}>Todo el día</div>
                {untimedEvents(mobileDay).map((e) => (
                  <div key={e.id} className="a-week-event" style={{ background: "var(--bg-card-2)", borderRadius: 6, padding: "6px 9px", marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>{e.title}</span>
                    <X size={13} style={{ cursor: "pointer" }} onClick={() => delEvent(mobileDay, e.id)} />
                  </div>
                ))}
              </div>
            )}
            <div className="a-card" style={{ padding: 0, overflow: "hidden" }}>
              {hours.map((h) => {
                const evs = eventsAtHour(mobileDay, h);
                return (
                  <div key={h} className="a-daygrid-row" onClick={() => { if (evs.length === 0) quickAdd(mobileDay, h); }}>
                    <span className="a-daygrid-hour">{pad2(h)}:00</span>
                    <div className="a-daygrid-content">
                      {evs.length === 0 && <span className="a-daygrid-placeholder">···</span>}
                      {evs.map((e) => (
                        <div key={e.id} className="a-week-event" style={{ background: "var(--bg-card-2)", borderRadius: 6, padding: "4px 8px", marginBottom: 3, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span>{e.title}</span>
                          <X size={12} style={{ cursor: "pointer" }} onClick={(ev) => { ev.stopPropagation(); delEvent(mobileDay, e.id); }} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {view === "mes" && (
        <div>
          <div className="a-grid a-grid-7" style={{ marginBottom: 6 }}>
            {WEEKDAYS_MON_FIRST.map((d) => <div key={d} className="a-sub" style={{ textAlign: "center", margin: 0 }}>{WEEKDAYS[d]}</div>)}
          </div>
          <div className="a-grid a-grid-7">
            {monthCells.map((d) => {
              const iso = toISO(d);
              const inMonth = d.getMonth() === monthDate.getMonth();
              const evs = eventsFor(iso);
              return (
                <div key={iso} className="a-card" style={{ padding: 6, minHeight: 74, opacity: inMonth ? 1 : 0.4, cursor: "pointer" }} onClick={() => setFormDate(iso)}>
                  <div className="agenda-mono" style={{ fontSize: 11 }}>{d.getDate()}</div>
                  {evs.slice(0, 2).map((e) => (
                    <div key={e.id} style={{ fontSize: 9.5, background: "var(--bg-card-2)", borderRadius: 4, padding: "1px 4px", marginTop: 2 }}>{e.title}</div>
                  ))}
                  {evs.length > 2 && <div className="a-sub" style={{ fontSize: 9, margin: 0 }}>+{evs.length - 2} más</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="a-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 14.5 }}>Notificarme de verdad</h3>
        <p className="a-sub">Esta app no puede enviar notificaciones por sí sola si está cerrada. Pero puedes exportar tus eventos a un archivo .ics e importarlo en Google Calendar u Outlook — ahí sí te van a llegar avisos al correo/celular.</p>
        <button className="a-btn secondary xs" onClick={() => {
          const all = [];
          Object.entries(data.calendarEvents || {}).forEach(([date, evs]) => evs.forEach((e) => all.push({ id: e.id, title: e.title, dtstart: dateTimeToICS(date, e.time) })));
          if (all.length === 0) { alert("No tienes eventos para exportar todavía."); return; }
          downloadFile("eventos-sanorganic.ics", buildICS(all), "text/calendar;charset=utf-8;");
        }}>Exportar todos los eventos (.ics)</button>
      </div>
    </div>
  );
}

/* ================= POMODORO (el estado vive en AgendaApp, sigue corriendo al cambiar de pestaña) ================= */
function PomodoroTab({ secondsLeft, running, mode, cycles, total, toggle, reset }) {
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div>
      <h1 className="a-h1 agenda-serif">Pomodoro</h1>
      <p className="a-sub">25 min de foco, 5 min de descanso. Sigue corriendo aunque cambies de sección.</p>
      <div className="a-card" style={{ textAlign: "center", padding: "40px 20px" }}>
        <div style={{ position: "relative", width: 180, height: 180, margin: "0 auto 20px" }}>
          <Ring pct={1 - secondsLeft / total} size={180} color={mode === "work" ? "var(--sage)" : "var(--butter)"} showLabel={false} />
          <div className="agenda-mono" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, fontWeight: 700 }}>{mm}:{ss}</div>
        </div>
        <div className="a-pill in" style={{ marginBottom: 20 }}>{mode === "work" ? "Foco" : "Descanso"}</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button className="a-btn" onClick={toggle}>{running ? <Pause size={14} /> : <Play size={14} />} {running ? "Pausar" : "Iniciar"}</button>
          <button className="a-btn secondary" onClick={reset}><RotateCcw size={14} /> Reiniciar</button>
        </div>
        <p className="a-sub" style={{ marginTop: 20 }}>Ciclos completados hoy: {cycles}</p>
      </div>
    </div>
  );
}

/* ================= RECORDATORIOS ================= */
function RecordatoriosTab({ data, patch }) {
  const [text, setText] = useState("");
  const [datetime, setDatetime] = useState("");

  const addReminder = () => {
    if (!text.trim()) return;
    patch((d) => ({ reminders: [...d.reminders, { id: uid(), text, datetime, done: false }] }));
    setText(""); setDatetime("");
  };
  const toggleDone = (id) => patch((d) => ({ reminders: d.reminders.map((r) => r.id === id ? { ...r, done: !r.done } : r) }));
  const delReminder = (id) => patch((d) => ({ reminders: d.reminders.filter((r) => r.id !== id) }));

  const sorted = [...data.reminders].sort((a, b) => (a.datetime || "").localeCompare(b.datetime || ""));
  const [notifStatus, setNotifStatus] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");

  const exportAllICS = () => {
    if (data.reminders.length === 0) { alert("No tienes recordatorios para exportar todavía."); return; }
    const events = data.reminders.filter((r) => r.datetime).map((r) => {
      const [d, t] = r.datetime.split("T");
      return { id: r.id, title: r.text, dtstart: dateTimeToICS(d, t) };
    });
    downloadFile("recordatorios-sanorganic.ics", buildICS(events), "text/calendar;charset=utf-8;");
  };

  return (
    <div>
      <h1 className="a-h1 agenda-serif">Recordatorios</h1>
      <p className="a-sub">Cosas que no quieres olvidar.</p>

      <div className="a-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 14.5 }}>Notificarme de verdad</h3>
        <p className="a-sub">
          Mientras esta pestaña esté abierta, la app puede avisarte con una notificación del navegador.
          Para que te avise incluso con la app cerrada (al correo o celular), exporta a .ics e impórtalo en Google Calendar u Outlook.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {notifStatus !== "unsupported" && notifStatus !== "granted" && (
            <button className="a-btn secondary xs" onClick={() => Notification.requestPermission().then(setNotifStatus)}>
              <Bell size={13} /> Activar avisos en este navegador
            </button>
          )}
          {notifStatus === "granted" && <span className="a-pill in">Avisos del navegador activados</span>}
          <button className="a-btn secondary xs" onClick={exportAllICS}>Exportar todos (.ics)</button>
        </div>
      </div>

      <div className="a-card" style={{ marginBottom: 16 }}>
        <div className="a-grid a-grid-2" style={{ marginBottom: 10 }}>
          <input className="a-input" placeholder="¿Qué necesitas recordar?" value={text} onChange={(e) => setText(e.target.value)} />
          <input className="a-input" type="datetime-local" value={datetime} onChange={(e) => setDatetime(e.target.value)} />
        </div>
        <button className="a-btn" onClick={addReminder}><Bell size={14} /> Agregar recordatorio</button>
      </div>
      <div className="a-card">
        {sorted.length === 0 && <p className="a-sub">Sin recordatorios pendientes.</p>}
        {sorted.map((r) => (
          <div className="a-list-item" key={r.id}>
            <div className={`a-check ${r.done ? "done" : ""}`} onClick={() => toggleDone(r.id)}>{r.done && <Check size={12} />}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, textDecoration: r.done ? "line-through" : "none", color: r.done ? "var(--text-faint)" : "var(--text)" }}>{r.text}</div>
              {r.datetime && <div className="a-sub" style={{ margin: 0, fontSize: 11.5 }}>{r.datetime.replace("T", " ")}</div>}
            </div>
            <Trash2 size={14} color="var(--text-faint)" style={{ cursor: "pointer" }} onClick={() => delReminder(r.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= EXPORTAR (planillas y respaldo) ================= */
function ExportPanel({ data }) {
  const exportTransactions = () => {
    const rows = data.transactions.map((t) => ({
      fecha: t.date, tipo: t.type, concepto: t.concept, categoria: t.category, monto: t.amount,
    }));
    downloadFile("finanzas-sanorganic.csv", toCSV(rows), "text/csv;charset=utf-8;");
  };
  const exportHabits = () => {
    const rows = [];
    data.habits.forEach((h) => {
      const meta = h.mode === "weekly" ? h.targetCount : h.targetQty;
      Object.entries(h.log).forEach(([date, qty]) => {
        rows.push({ habito: h.name, modo: h.mode || "daily", fecha: date, cantidad: qty, meta, unidad: h.unit || "", cumplido: qty >= meta ? "sí" : "no" });
      });
    });
    downloadFile("habitos-sanorganic.csv", toCSV(rows), "text/csv;charset=utf-8;");
  };
  const exportBackup = () => {
    downloadFile("respaldo-agenda-sanorganic.json", JSON.stringify(data, null, 2), "application/json");
  };

  return (
    <div className="a-card">
      <h3 style={{ marginTop: 0, fontSize: 14.5 }}>Exportar datos</h3>
      <p className="a-sub">Descarga tus datos como planilla (Excel/Google Sheets puede abrir estos .csv directamente) o como respaldo completo.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="a-btn secondary xs" onClick={exportTransactions}>Movimientos financieros (.csv)</button>
        <button className="a-btn secondary xs" onClick={exportHabits}>Registro de hábitos (.csv)</button>
        <button className="a-btn secondary xs" onClick={exportBackup}>Respaldo completo (.json)</button>
      </div>
    </div>
  );
}

/* ================= AJUSTES (personalización y datos) ================= */
function AjustesTab({ data, patch, setData }) {
  const [wallpaperInput, setWallpaperInput] = useState(data.wallpaper || "");
  const fileInputRef = useRef(null);

  const saveName = (name) => patch(() => ({ name }));
  const saveWallpaper = () => patch(() => ({ wallpaper: wallpaperInput.trim() }));
  const clearWallpaper = () => { setWallpaperInput(""); patch(() => ({ wallpaper: "" })); };

  const importBackup = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!confirm("Esto va a reemplazar todos tus datos actuales con los del respaldo. ¿Continuar?")) return;
        setData({ ...defaultData(), ...parsed });
        alert("Respaldo importado correctamente.");
      } catch {
        alert("No se pudo leer ese archivo. Asegúrate de que sea un respaldo .json exportado desde esta misma agenda.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const resetAll = () => {
    if (!confirm("Esto borra TODOS tus datos (hábitos, finanzas, notas, todo) y no se puede deshacer. ¿Seguro que quieres continuar?")) return;
    setData(defaultData());
  };

  return (
    <div>
      <h1 className="a-h1 agenda-serif">Ajustes</h1>
      <p className="a-sub">Personalización y gestión de tus datos.</p>

      <div className="a-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 14.5 }}>Tu nombre</h3>
        <input className="a-input" placeholder="¿Cómo quieres que te salude la agenda?" value={data.name} onChange={(e) => saveName(e.target.value)} style={{ maxWidth: 320 }} />
      </div>

      <div className="a-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 14.5 }}><ImageIcon size={15} style={{ verticalAlign: -2 }} /> Fondo de pantalla</h3>
        <p className="a-sub">Pega el link de una imagen (ej. de Unsplash) para usarla de fondo detrás de la agenda.</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <input className="a-input" placeholder="https://..." value={wallpaperInput} onChange={(e) => setWallpaperInput(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
          <button className="a-btn secondary xs" onClick={saveWallpaper}>Aplicar</button>
          {data.wallpaper && <button className="a-btn danger xs" onClick={clearWallpaper}>Quitar fondo</button>}
        </div>
        {data.wallpaper && (
          <img src={data.wallpaper} alt="Vista previa del fondo" style={{ maxWidth: "100%", maxHeight: 140, borderRadius: 10, border: "1px solid var(--line)" }} />
        )}
      </div>

      <div className="a-card">
        <h3 style={{ marginTop: 0, fontSize: 14.5 }}>Gestión de datos</h3>
        <p className="a-sub">Todo se guarda en este navegador. Exporta un respaldo de vez en cuando por seguridad, o impórtalo si cambias de computador.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="a-btn secondary xs" onClick={() => downloadFile("respaldo-agenda-sanorganic.json", JSON.stringify(data, null, 2), "application/json")}>
            <Download size={13} /> Exportar respaldo (.json)
          </button>
          <button className="a-btn secondary xs" onClick={() => fileInputRef.current?.click()}>
            <Upload size={13} /> Importar respaldo
          </button>
          <input ref={fileInputRef} type="file" accept="application/json" style={{ display: "none" }} onChange={importBackup} />
          <button className="a-btn danger xs" onClick={resetAll}>Restaurar a valores por defecto</button>
        </div>
      </div>
    </div>
  );
}

/* ================= STATS ================= */
function StatsTab({ data, month, monthTx }) {
  const byCategory = {};
  monthTx.filter((t) => t.type === "egreso").forEach((t) => { byCategory[t.category] = (byCategory[t.category] || 0) + t.amount; });
  const totalEgresos = Object.values(byCategory).reduce((a, b) => a + b, 0) || 1;

  const today = todayISO();
  const weekStart = startOfWeek(today);
  const habitStats = data.habits.map((h) => ({ h, wp: habitWeekProgress(h, today, weekStart) }));
  const habitRate = habitStats.length ? habitStats.reduce((s, x) => s + x.wp.pct, 0) / habitStats.length : 0;

  return (
    <div>
      <h1 className="a-h1 agenda-serif">Estadísticas</h1>
      <p className="a-sub">Vista rápida de {monthLabel(month)}.</p>
      <div className="a-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 14.5 }}>Desglose de egresos por categoría</h3>
        {Object.keys(byCategory).length === 0 && <p className="a-sub">Sin egresos registrados este mes.</p>}
        {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
          <div key={cat} style={{ marginBottom: 10 }}>
            <div className="a-row" style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 13 }}>{cat}</span>
              <span className="agenda-mono" style={{ fontSize: 12.5 }}>{formatCLP(amt)}</span>
            </div>
            <div style={{ height: 6, background: "var(--line)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(amt / totalEgresos) * 100}%`, background: "var(--clay)" }} />
            </div>
          </div>
        ))}
      </div>
      <div className="a-card" style={{ marginBottom: 16 }}>
        <div className="a-row" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 14.5 }}>Cumplimiento de hábitos esta semana</h3>
          <Ring pct={habitRate} size={54} color="var(--sage)" />
        </div>
        {habitStats.length === 0 && <p className="a-sub">Aún no tienes hábitos creados.</p>}
        {habitStats.map(({ h, wp }) => (
          <div key={h.id} style={{ marginBottom: 10 }}>
            <div className="a-row" style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 13 }}>{h.emoji} {h.name}</span>
              <span className="agenda-mono" style={{ fontSize: 12.5 }}>{wp.done}/{wp.required} · {Math.round(wp.pct * 100)}%</span>
            </div>
            <div style={{ height: 6, background: "var(--line)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${wp.pct * 100}%`, background: "var(--sage)" }} />
            </div>
          </div>
        ))}
      </div>
      <ExportPanel data={data} />
    </div>
  );
}
