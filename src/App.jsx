import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Home, ListChecks, Repeat, Wallet, BookOpen, StickyNote, Calendar,
  BarChart3, Plus, Trash2, ChevronLeft, ChevronRight, Target, PiggyBank,
  TrendingUp, TrendingDown, X, Check, Sparkles, Flag, FolderKanban, Circle
} from "lucide-react";

/* ---------------------------------------------------------
   MI AGENDA — SAN-ORGANIC
   Agenda personal con Finanzas + Metas + Ahorros vinculados
   por mes. Todo se guarda en memoria (useState) durante la
   sesión — en producción real se conectaría a localStorage.
--------------------------------------------------------- */

const STORAGE_KEY = "mi-agenda-sanorganic-v1";

const uid = () => Math.random().toString(36).slice(2, 10);
const todayISO = () => new Date().toISOString().slice(0, 10);
const monthKey = (isoDate) => isoDate.slice(0, 7); // YYYY-MM
const currentMonthKey = () => todayISO().slice(0, 7);

const monthLabel = (key) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
};

const formatCLP = (n) =>
  "$" + Math.round(n || 0).toLocaleString("es-CL");

const shiftMonth = (key, delta) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const monthsBetween = (fromKey, toKey) => {
  const [y1, m1] = fromKey.split("-").map(Number);
  const [y2, m2] = toKey.split("-").map(Number);
  return Math.max(0, (y2 - y1) * 12 + (m2 - m1));
};

const defaultData = () => ({
  name: "",
  priorities: {}, // { 'YYYY-MM-DD': [{id,text,done}] }
  habits: [
    { id: uid(), name: "Tomar agua", emoji: "💧", log: {} },
    { id: uid(), name: "Mover el cuerpo", emoji: "🌱", log: {} },
  ],
  categories: {
    ingreso: ["Ventas SAN-ORGANIC", "Sueldo", "Otros ingresos"],
    egreso: ["Insumos", "Empaque", "Marketing", "Personal", "Otros"],
  },
  transactions: [], // {id,type,concept,amount,category,date,pocketId?}
  goals: [], // {id,name,type:'mensual'|'fijo',target,category?,pocketId?,dueMonth?}
  pockets: [], // {id,name,area,current}
  objectives: [], // {id,title,area,dueDate,milestones:[{id,text,done}]}
  projects: [], // {id,name,description,status,deadline,tasks:[{id,text,done}]}
  notes: [],
  journal: {}, // { 'YYYY-MM-DD': {mood, gratitude, text} }
});

function useLocalState() {
  const [data, setData] = useState(() => {
    try {
      const raw =
        typeof window !== "undefined" && window.localStorage
          ? localStorage.getItem(STORAGE_KEY)
          : null;
      return raw ? { ...defaultData(), ...JSON.parse(raw) } : defaultData();
    } catch {
      return defaultData();
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* almacenamiento no disponible, seguimos en memoria */
    }
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
      align-items:center; padding:20px 0; gap:6px;
    }
    .a-navbtn {
      width:48px; height:48px; border-radius:14px; display:flex;
      align-items:center; justify-content:center; color:var(--text-soft);
      background:transparent; border:none; cursor:pointer; transition:all .15s;
    }
    .a-navbtn:hover { background:var(--bg-card-2); color:var(--text); }
    .a-navbtn.active { background:var(--sage-dim); color:var(--sage); }
    .a-navlabel { font-size:9px; margin-top:2px; letter-spacing:.02em; }

    .a-main { flex:1; min-width:0; padding:28px 34px; overflow-y:auto; max-height:92vh; }
    .a-h1 { font-size:26px; font-weight:600; margin:0 0 4px; }
    .a-sub { color:var(--text-soft); font-size:13.5px; margin:0 0 24px; }

    .a-card {
      background:var(--bg-card); border:1px solid var(--line);
      border-radius:16px; padding:18px 20px;
    }
    .a-grid { display:grid; gap:14px; }
    .a-grid-3 { grid-template-columns:repeat(3,1fr); }
    .a-grid-2 { grid-template-columns:repeat(2,1fr); }

    .a-stat-label { font-size:11px; text-transform:uppercase; letter-spacing:.07em; color:var(--text-soft); margin-bottom:6px;}
    .a-stat-num { font-size:22px; font-weight:600; }

    .a-input, .a-select {
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

    .a-pill { font-size:10.5px; padding:3px 9px; border-radius:999px; font-weight:700; letter-spacing:.02em;}
    .a-pill.in { background:var(--sage-dim); color:var(--sage); }
    .a-pill.out { background:var(--clay-dim); color:var(--clay); }

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

    .a-mobiletabs { display:none; }
    @media (max-width: 760px) {
      .agenda-root { flex-direction:column; border-radius:0; }
      .a-nav { width:100%; flex-direction:row; justify-content:space-around; padding:8px 4px; order:2; }
      .a-main { max-height:none; padding:18px 16px 90px; }
      .a-grid-3 { grid-template-columns:1fr; }
      .a-grid-2 { grid-template-columns:1fr; }
    }
  `}</style>
);

const NAV = [
  { id: "inicio", label: "Inicio", icon: Home },
  { id: "prioridades", label: "Día", icon: ListChecks },
  { id: "habitos", label: "Hábitos", icon: Repeat },
  { id: "finanzas", label: "Finanzas", icon: Wallet },
  { id: "objetivos", label: "Metas", icon: Flag },
  { id: "proyectos", label: "Proyectos", icon: FolderKanban },
  { id: "diario", label: "Diario", icon: BookOpen },
  { id: "notas", label: "Notas", icon: StickyNote },
  { id: "calendario", label: "Agenda", icon: Calendar },
  { id: "stats", label: "Stats", icon: BarChart3 },
];

/* ---------------- RING PROGRESS ---------------- */
function Ring({ pct, color = "var(--sage)", size = 78 }) {
  const clamped = Math.max(0, Math.min(1, pct));
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="a-ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--line)" strokeWidth="7" fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="7" fill="none"
          strokeDasharray={c} strokeDashoffset={c - clamped * c} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset .4s ease" }}
        />
      </svg>
      <div className="a-ring-label">{Math.round(clamped * 100)}%</div>
    </div>
  );
}

/* ============================================================ */

export default function AgendaApp() {
  const [data, setData] = useLocalState();
  const [tab, setTab] = useState("inicio");
  const [month, setMonth] = useState(currentMonthKey());
  const [financeTab, setFinanceTab] = useState("resumen");

  const patch = (fn) => setData((d) => ({ ...d, ...fn(d) }));

  /* ---------- derived: finance for selected month ---------- */
  const monthTx = useMemo(
    () => data.transactions.filter((t) => monthKey(t.date) === month),
    [data.transactions, month]
  );
  const ingresosMes = monthTx.filter((t) => t.type === "ingreso").reduce((s, t) => s + t.amount, 0);
  const egresosMes = monthTx.filter((t) => t.type === "egreso").reduce((s, t) => s + t.amount, 0);
  const balanceMes = ingresosMes - egresosMes;

  const goalProgress = (goal) => {
    if (goal.type === "mensual") {
      const base = data.transactions.filter(
        (t) =>
          t.type === "ingreso" &&
          monthKey(t.date) === month &&
          (!goal.category || t.category === goal.category)
      );
      const sum = base.reduce((s, t) => s + t.amount, 0);
      return { current: sum, target: goal.target, pct: goal.target ? sum / goal.target : 0 };
    }
    // fijo -> ligado a un pocket de ahorro
    const pocket = data.pockets.find((p) => p.id === goal.pocketId);
    const current = pocket ? pocket.current : 0;
    return { current, target: goal.target, pct: goal.target ? current / goal.target : 0 };
  };

  /* ---------- priorities ---------- */
  const todayList = data.priorities[todayISO()] || [];
  const addPriority = (text) => {
    if (!text.trim()) return;
    patch((d) => ({
      priorities: {
        ...d.priorities,
        [todayISO()]: [...(d.priorities[todayISO()] || []), { id: uid(), text, done: false }],
      },
    }));
  };
  const togglePriority = (id) => {
    patch((d) => ({
      priorities: {
        ...d.priorities,
        [todayISO()]: (d.priorities[todayISO()] || []).map((p) =>
          p.id === id ? { ...p, done: !p.done } : p
        ),
      },
    }));
  };
  const delPriority = (id) => {
    patch((d) => ({
      priorities: {
        ...d.priorities,
        [todayISO()]: (d.priorities[todayISO()] || []).filter((p) => p.id !== id),
      },
    }));
  };

  const progressPct = todayList.length
    ? todayList.filter((p) => p.done).length / todayList.length
    : 0;

  return (
    <div className="agenda-root">
      <GlobalStyle />
      <nav className="a-nav">
        {NAV.map((n) => {
          const Icon = n.icon;
          return (
            <button
              key={n.id}
              className={`a-navbtn ${tab === n.id ? "active" : ""}`}
              onClick={() => setTab(n.id)}
              title={n.label}
              style={{ flexDirection: "column" }}
            >
              <Icon size={19} />
            </button>
          );
        })}
      </nav>

      <main className="a-main">
        {tab === "inicio" && (
          <InicioTab
            data={data}
            todayList={todayList}
            progressPct={progressPct}
            ingresosMes={ingresosMes}
            egresosMes={egresosMes}
            month={month}
            goalProgress={goalProgress}
            goToFinanzas={() => setTab("finanzas")}
          />
        )}

        {tab === "prioridades" && (
          <PrioridadesTab
            list={todayList}
            onAdd={addPriority}
            onToggle={togglePriority}
            onDelete={delPriority}
          />
        )}

        {tab === "habitos" && <HabitosTab data={data} patch={patch} />}

        {tab === "finanzas" && (
          <FinanzasTab
            data={data}
            patch={patch}
            month={month}
            setMonth={setMonth}
            monthTx={monthTx}
            ingresosMes={ingresosMes}
            egresosMes={egresosMes}
            balanceMes={balanceMes}
            goalProgress={goalProgress}
            financeTab={financeTab}
            setFinanceTab={setFinanceTab}
          />
        )}

        {tab === "objetivos" && <ObjetivosTab data={data} patch={patch} />}
        {tab === "proyectos" && <ProyectosTab data={data} patch={patch} />}
        {tab === "diario" && <DiarioTab data={data} patch={patch} />}
        {tab === "notas" && <NotasTab data={data} patch={patch} />}
        {tab === "calendario" && <CalendarioTab data={data} patch={patch} />}
        {tab === "stats" && (
          <StatsTab data={data} month={month} monthTx={monthTx} />
        )}
      </main>
    </div>
  );
}

/* ================= INICIO ================= */
function InicioTab({ data, todayList, progressPct, ingresosMes, egresosMes, month, goalProgress, goToFinanzas }) {
  const topGoals = data.goals.slice(0, 2);
  return (
    <div>
      <h1 className="a-h1 agenda-serif">
        {data.name ? `Hola, ${data.name} 🌿` : "Hola 🌿"}
      </h1>
      <p className="a-sub">Tu resumen de {monthLabel(month)}.</p>

      <div className="a-grid a-grid-3" style={{ marginBottom: 16 }}>
        <div className="a-card">
          <div className="a-stat-label">Progreso del día</div>
          <div className="a-stat-num agenda-mono">{Math.round(progressPct * 100)}%</div>
        </div>
        <div className="a-card">
          <div className="a-stat-label">Ingresos del mes</div>
          <div className="a-stat-num agenda-mono" style={{ color: "var(--sage)" }}>
            {formatCLP(ingresosMes)}
          </div>
        </div>
        <div className="a-card">
          <div className="a-stat-label">Egresos del mes</div>
          <div className="a-stat-num agenda-mono" style={{ color: "var(--clay)" }}>
            {formatCLP(egresosMes)}
          </div>
        </div>
      </div>

      <div className="a-card" style={{ marginBottom: 16 }}>
        <div className="a-row" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Prioridades de hoy</h3>
          <span className="a-sub" style={{ margin: 0 }}>{todayList.filter(t=>t.done).length}/{todayList.length}</span>
        </div>
        {todayList.length === 0 && <p className="a-sub">Aún no tienes tareas para hoy.</p>}
        {todayList.slice(0, 4).map((p) => (
          <div className="a-list-item" key={p.id}>
            <div className={`a-check ${p.done ? "done" : ""}`}>{p.done && <Check size={12} />}</div>
            <span style={{ textDecoration: p.done ? "line-through" : "none", color: p.done ? "var(--text-faint)" : "var(--text)" }}>
              {p.text}
            </span>
          </div>
        ))}
      </div>

      {topGoals.length > 0 && (
        <div className="a-card">
          <div className="a-row" style={{ marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>Tus metas</h3>
            <button className="a-btn secondary" onClick={goToFinanzas} style={{ fontSize: 11.5 }}>
              Ver todas
            </button>
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {topGoals.map((g) => {
              const p = goalProgress(g);
              return (
                <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Ring pct={p.pct} color={p.pct >= 1 ? "var(--sage)" : "var(--butter)"} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{g.name}</div>
                    <div className="a-sub agenda-mono" style={{ margin: 0 }}>
                      {formatCLP(p.current)} / {formatCLP(p.target)}
                    </div>
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
          <input
            className="a-input"
            placeholder="Añadir tarea..."
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { onAdd(val); setVal(""); } }}
          />
          <button className="a-btn" onClick={() => { onAdd(val); setVal(""); }}><Plus size={15} /></button>
        </div>
        {list.length === 0 && <p className="a-sub">Sin tareas todavía. Añade la primera arriba.</p>}
        {list.map((p) => (
          <div className="a-list-item" key={p.id}>
            <div className={`a-check ${p.done ? "done" : ""}`} onClick={() => onToggle(p.id)}>
              {p.done && <Check size={12} />}
            </div>
            <span style={{ flex: 1, textDecoration: p.done ? "line-through" : "none", color: p.done ? "var(--text-faint)" : "var(--text)" }}>
              {p.text}
            </span>
            <Trash2 size={14} color="var(--text-faint)" style={{ cursor: "pointer" }} onClick={() => onDelete(p.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= HABITOS ================= */
function HabitosTab({ data, patch }) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🌿");
  const today = todayISO();

  const addHabit = () => {
    if (!name.trim()) return;
    patch((d) => ({ habits: [...d.habits, { id: uid(), name, emoji, log: {} }] }));
    setName(""); setEmoji("🌿");
  };
  const toggleToday = (hid) => {
    patch((d) => ({
      habits: d.habits.map((h) =>
        h.id === hid ? { ...h, log: { ...h.log, [today]: !h.log[today] } } : h
      ),
    }));
  };
  const streak = (h) => {
    let s = 0, d = new Date();
    while (true) {
      const key = d.toISOString().slice(0, 10);
      if (h.log[key]) { s++; d.setDate(d.getDate() - 1); } else break;
    }
    return s;
  };
  const removeHabit = (hid) => patch((d) => ({ habits: d.habits.filter((h) => h.id !== hid) }));

  return (
    <div>
      <h1 className="a-h1 agenda-serif">Hábitos</h1>
      <p className="a-sub">Constancia diaria, un día a la vez.</p>

      <div className="a-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="a-input" style={{ width: 60 }} value={emoji} onChange={(e) => setEmoji(e.target.value)} />
          <input className="a-input" placeholder="Nuevo hábito..." value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addHabit()} />
          <button className="a-btn" onClick={addHabit}><Plus size={15} /></button>
        </div>
      </div>

      <div className="a-grid a-grid-2">
        {data.habits.map((h) => (
          <div className="a-card" key={h.id}>
            <div className="a-row">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 22 }}>{h.emoji}</span>
                <div>
                  <div style={{ fontWeight: 600 }}>{h.name}</div>
                  <div className="a-sub agenda-mono" style={{ margin: 0 }}>🔥 {streak(h)} días</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div className={`a-check ${h.log[today] ? "done" : ""}`} onClick={() => toggleToday(h.id)}>
                  {h.log[today] && <Check size={12} />}
                </div>
                <Trash2 size={14} color="var(--text-faint)" style={{ cursor: "pointer" }} onClick={() => removeHabit(h.id)} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= FINANZAS (módulo estrella) ================= */
function FinanzasTab({ data, patch, month, setMonth, monthTx, ingresosMes, egresosMes, balanceMes, goalProgress, financeTab, setFinanceTab }) {
  const sub = [
    { id: "resumen", label: "Resumen" },
    { id: "movimientos", label: "Movimientos" },
    { id: "metas", label: "Metas" },
    { id: "ahorros", label: "Ahorros" },
  ];

  return (
    <div>
      <div className="a-row" style={{ marginBottom: 4 }}>
        <div>
          <h1 className="a-h1 agenda-serif">Finanzas</h1>
          <p className="a-sub">Ingresos, egresos, metas y ahorros — todo por mes.</p>
        </div>
        <div className="a-monthnav">
          <button onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={15} /></button>
          <span className="agenda-mono" style={{ fontSize: 13, textTransform: "capitalize", minWidth: 130, textAlign: "center" }}>
            {monthLabel(month)}
          </span>
          <button onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={15} /></button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, margin: "18px 0" }}>
        {sub.map((s) => (
          <button
            key={s.id}
            className={`a-btn ${financeTab === s.id ? "" : "secondary"}`}
            style={{ fontSize: 12 }}
            onClick={() => setFinanceTab(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {financeTab === "resumen" && (
        <ResumenFinanzas
          ingresosMes={ingresosMes} egresosMes={egresosMes} balanceMes={balanceMes}
          data={data} goalProgress={goalProgress}
        />
      )}
      {financeTab === "movimientos" && (
        <MovimientosFinanzas data={data} patch={patch} monthTx={monthTx} month={month} />
      )}
      {financeTab === "metas" && (
        <MetasFinanzas data={data} patch={patch} goalProgress={goalProgress} month={month} />
      )}
      {financeTab === "ahorros" && (
        <AhorrosFinanzas data={data} patch={patch} month={month} />
      )}
    </div>
  );
}

function ResumenFinanzas({ ingresosMes, egresosMes, balanceMes, data, goalProgress }) {
  return (
    <div>
      <div className="a-grid a-grid-3" style={{ marginBottom: 18 }}>
        <div className="a-card">
          <div className="a-row"><TrendingUp size={15} color="var(--sage)" /><span className="a-pill in">Ingresos</span></div>
          <div className="a-stat-num agenda-mono" style={{ marginTop: 8 }}>{formatCLP(ingresosMes)}</div>
        </div>
        <div className="a-card">
          <div className="a-row"><TrendingDown size={15} color="var(--clay)" /><span className="a-pill out">Egresos</span></div>
          <div className="a-stat-num agenda-mono" style={{ marginTop: 8 }}>{formatCLP(egresosMes)}</div>
        </div>
        <div className="a-card">
          <div className="a-stat-label">Balance del mes</div>
          <div className="a-stat-num agenda-mono" style={{ color: balanceMes >= 0 ? "var(--sage)" : "var(--clay)" }}>
            {formatCLP(balanceMes)}
          </div>
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
                  <div className="a-sub" style={{ margin: 0 }}>{g.type === "mensual" ? "Meta mensual" : "Meta a plazo fijo"}</div>
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
  const [date, setDate] = useState(todayISO());

  const cats = data.categories[type] || [];
  useEffect(() => { setCategory(cats[0] || ""); }, [type]); // eslint-disable-line

  const addTx = () => {
    const amt = parseFloat(amount);
    if (!concept.trim() || !amt) return;
    patch((d) => ({
      transactions: [
        { id: uid(), type, concept, amount: amt, category, date },
        ...d.transactions,
      ],
    }));
    setConcept(""); setAmount("");
  };
  const delTx = (id) => patch((d) => ({ transactions: d.transactions.filter((t) => t.id !== id) }));

  return (
    <div>
      <div className="a-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 14.5 }}>Registrar movimiento</h3>
        <div className="a-grid a-grid-2" style={{ marginBottom: 10 }}>
          <select className="a-select" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="ingreso">↑ Ingreso</option>
            <option value="egreso">↓ Egreso</option>
          </select>
          <select className="a-select" value={category} onChange={(e) => setCategory(e.target.value)}>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="a-grid a-grid-3" style={{ marginBottom: 10 }}>
          <input className="a-input" placeholder="Concepto (ej: venta empanadas)" value={concept} onChange={(e) => setConcept(e.target.value)} />
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
            <span className={`a-pill ${t.type === "ingreso" ? "in" : "out"}`}>{t.type === "ingreso" ? "↑" : "↓"}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5 }}>{t.concept}</div>
              <div className="a-sub" style={{ margin: 0, fontSize: 11.5 }}>{t.category} · {t.date}</div>
            </div>
            <span className="agenda-mono" style={{ color: t.type === "ingreso" ? "var(--sage)" : "var(--clay)" }}>
              {formatCLP(t.amount)}
            </span>
            <Trash2 size={14} color="var(--text-faint)" style={{ cursor: "pointer" }} onClick={() => delTx(t.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function MetasFinanzas({ data, patch, goalProgress, month }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("mensual");
  const [target, setTarget] = useState("");
  const [category, setCategory] = useState("");
  const [pocketId, setPocketId] = useState(data.pockets[0]?.id || "");

  const addGoal = () => {
    const t = parseFloat(target);
    if (!name.trim() || !t) return;
    patch((d) => ({
      goals: [
        ...d.goals,
        type === "mensual"
          ? { id: uid(), name, type, target: t, category: category || null }
          : { id: uid(), name, type, target: t, pocketId: pocketId || null },
      ],
    }));
    setName(""); setTarget("");
  };
  const delGoal = (id) => patch((d) => ({ goals: d.goals.filter((g) => g.id !== id) }));

  return (
    <div>
      <div className="a-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 14.5 }}>Nueva meta</h3>
        <p className="a-sub">Una meta <b>mensual</b> se compara con tus ingresos de cada mes (ej: sueldo objetivo). Una meta a <b>plazo fijo</b> se compara con el saldo de un fondo de ahorro.</p>
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
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AhorrosFinanzas({ data, patch, month }) {
  const [name, setName] = useState("");
  const [area, setArea] = useState("Personal");
  const [target, setTarget] = useState("");
  const [aportes, setAportes] = useState({});

  const addPocket = () => {
    if (!name.trim()) return;
    patch((d) => ({
      pockets: [...d.pockets, { id: uid(), name, area, target: parseFloat(target) || 0, current: 0 }],
    }));
    setName(""); setTarget("");
  };

  const aportar = (pocket) => {
    const amt = parseFloat(aportes[pocket.id]);
    if (!amt) return;
    patch((d) => ({
      pockets: d.pockets.map((p) => p.id === pocket.id ? { ...p, current: p.current + amt } : p),
      transactions: [
        { id: uid(), type: "egreso", concept: `Aporte a ahorro: ${pocket.name}`, amount: amt, category: "Ahorro", date: todayISO(), pocketId: pocket.id },
        ...d.transactions,
      ],
    }));
    setAportes((a) => ({ ...a, [pocket.id]: "" }));
  };

  const delPocket = (id) => patch((d) => ({ pockets: d.pockets.filter((p) => p.id !== id) }));

  return (
    <div>
      <div className="a-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 14.5 }}>Nuevo fondo de ahorro</h3>
        <p className="a-sub">Crea fondos separados por área: personal, SAN-ORGANIC, emergencia, lo que necesites.</p>
        <div className="a-grid a-grid-3" style={{ marginBottom: 10 }}>
          <input className="a-input" placeholder="Nombre (ej: Nuevo horno)" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="a-input" placeholder="Área (ej: SAN-ORGANIC)" value={area} onChange={(e) => setArea(e.target.value)} />
          <input className="a-input" type="number" placeholder="Meta (opcional)" value={target} onChange={(e) => setTarget(e.target.value)} />
        </div>
        <button className="a-btn" onClick={addPocket}><PiggyBank size={14} /> Crear fondo</button>
      </div>

      <div className="a-grid a-grid-2">
        {data.pockets.map((p) => (
          <div className="a-card" key={p.id}>
            <div className="a-row">
              <div>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div className="a-sub" style={{ margin: 0 }}>{p.area}</div>
              </div>
              <Trash2 size={14} color="var(--text-faint)" style={{ cursor: "pointer" }} onClick={() => delPocket(p.id)} />
            </div>
            <div className="agenda-mono" style={{ fontSize: 18, margin: "10px 0 2px", fontWeight: 600 }}>
              {formatCLP(p.current)}{p.target ? <span className="a-sub" style={{ fontSize: 13 }}> / {formatCLP(p.target)}</span> : null}
            </div>
            {p.target > 0 && (
              <div style={{ height: 6, background: "var(--line)", borderRadius: 4, overflow: "hidden", marginBottom: 12 }}>
                <div style={{ height: "100%", width: `${Math.min(100, (p.current / p.target) * 100)}%`, background: "var(--sage)" }} />
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input
                className="a-input" type="number" placeholder="Aportar monto"
                value={aportes[p.id] || ""}
                onChange={(e) => setAportes((a) => ({ ...a, [p.id]: e.target.value }))}
              />
              <button className="a-btn secondary" onClick={() => aportar(p)}>Aportar</button>
            </div>
          </div>
        ))}
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
    patch((d) => ({
      objectives: [
        ...d.objectives,
        { id: uid(), title, area, dueDate, milestones: [] },
      ],
    }));
    setTitle(""); setDueDate("");
  };
  const delObjective = (id) => patch((d) => ({ objectives: d.objectives.filter((o) => o.id !== id) }));

  const addMilestone = (obj) => {
    const text = (milestoneDraft[obj.id] || "").trim();
    if (!text) return;
    patch((d) => ({
      objectives: d.objectives.map((o) =>
        o.id === obj.id ? { ...o, milestones: [...o.milestones, { id: uid(), text, done: false }] } : o
      ),
    }));
    setMilestoneDraft((m) => ({ ...m, [obj.id]: "" }));
  };
  const toggleMilestone = (objId, msId) => {
    patch((d) => ({
      objectives: d.objectives.map((o) =>
        o.id === objId
          ? { ...o, milestones: o.milestones.map((m) => m.id === msId ? { ...m, done: !m.done } : m) }
          : o
      ),
    }));
  };
  const delMilestone = (objId, msId) => {
    patch((d) => ({
      objectives: d.objectives.map((o) =>
        o.id === objId ? { ...o, milestones: o.milestones.filter((m) => m.id !== msId) } : o
      ),
    }));
  };

  return (
    <div>
      <h1 className="a-h1 agenda-serif">Metas y objetivos</h1>
      <p className="a-sub">Todo lo que quieres lograr que no se mide en dinero: hitos, hábitos de vida, aprendizajes.</p>

      <div className="a-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 14.5 }}>Nuevo objetivo</h3>
        <div className="a-grid a-grid-3" style={{ marginBottom: 10 }}>
          <input className="a-input" placeholder="Ej: Aprender a hacer pan de masa madre" value={title} onChange={(e) => setTitle(e.target.value)} />
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
                    <div className="a-sub" style={{ margin: 0 }}>
                      {o.area}{o.dueDate ? ` · para ${o.dueDate}` : ""}
                    </div>
                    <div className="a-sub" style={{ margin: 0 }}>{done}/{total} hitos</div>
                  </div>
                </div>
                <Trash2 size={14} color="var(--text-faint)" style={{ cursor: "pointer" }} onClick={() => delObjective(o.id)} />
              </div>

              <hr className="a-divider" />

              {o.milestones.map((m) => (
                <div className="a-list-item" key={m.id}>
                  <div className={`a-check ${m.done ? "done" : ""}`} onClick={() => toggleMilestone(o.id, m.id)}>
                    {m.done && <Check size={12} />}
                  </div>
                  <span style={{ flex: 1, fontSize: 13, textDecoration: m.done ? "line-through" : "none", color: m.done ? "var(--text-faint)" : "var(--text)" }}>
                    {m.text}
                  </span>
                  <Trash2 size={13} color="var(--text-faint)" style={{ cursor: "pointer" }} onClick={() => delMilestone(o.id, m.id)} />
                </div>
              ))}

              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <input
                  className="a-input" placeholder="Añadir hito..."
                  value={milestoneDraft[o.id] || ""}
                  onChange={(e) => setMilestoneDraft((m) => ({ ...m, [o.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && addMilestone(o)}
                />
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
    patch((d) => ({
      projects: [
        ...d.projects,
        { id: uid(), name, description, status: "planificacion", deadline, tasks: [] },
      ],
    }));
    setName(""); setDescription(""); setDeadline("");
  };
  const delProject = (id) => patch((d) => ({ projects: d.projects.filter((p) => p.id !== id) }));
  const setStatus = (id, status) => {
    patch((d) => ({ projects: d.projects.map((p) => p.id === id ? { ...p, status } : p) }));
  };
  const addTask = (proj) => {
    const text = (taskDraft[proj.id] || "").trim();
    if (!text) return;
    patch((d) => ({
      projects: d.projects.map((p) =>
        p.id === proj.id ? { ...p, tasks: [...p.tasks, { id: uid(), text, done: false }] } : p
      ),
    }));
    setTaskDraft((t) => ({ ...t, [proj.id]: "" }));
  };
  const toggleTask = (projId, taskId) => {
    patch((d) => ({
      projects: d.projects.map((p) =>
        p.id === projId ? { ...p, tasks: p.tasks.map((t) => t.id === taskId ? { ...t, done: !t.done } : t) } : p
      ),
    }));
  };
  const delTask = (projId, taskId) => {
    patch((d) => ({
      projects: d.projects.map((p) =>
        p.id === projId ? { ...p, tasks: p.tasks.filter((t) => t.id !== taskId) } : p
      ),
    }));
  };

  return (
    <div>
      <h1 className="a-h1 agenda-serif">Proyectos</h1>
      <p className="a-sub">Iniciativas con varios pasos: lanzamientos, mejoras, cosas que armas de a poco.</p>

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
                  <div className={`a-check ${t.done ? "done" : ""}`} onClick={() => toggleTask(p.id, t.id)}>
                    {t.done && <Check size={12} />}
                  </div>
                  <span style={{ flex: 1, fontSize: 13, textDecoration: t.done ? "line-through" : "none", color: t.done ? "var(--text-faint)" : "var(--text)" }}>
                    {t.text}
                  </span>
                  <Trash2 size={13} color="var(--text-faint)" style={{ cursor: "pointer" }} onClick={() => delTask(p.id, t.id)} />
                </div>
              ))}

              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <input
                  className="a-input" placeholder="Añadir tarea..."
                  value={taskDraft[p.id] || ""}
                  onChange={(e) => setTaskDraft((t) => ({ ...t, [p.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && addTask(p)}
                />
                <button className="a-btn secondary icon" onClick={() => addTask(p)}><Plus size={14} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================= DIARIO ================= */
function DiarioTab({ data, patch }) {
  const today = todayISO();
  const entry = data.journal[today] || { mood: "", gratitude: "", text: "" };
  const update = (field, val) => {
    patch((d) => ({ journal: { ...d.journal, [today]: { ...entry, [field]: val } } }));
  };
  const moods = ["😊", "😌", "😐", "😔", "😤", "🥳"];

  return (
    <div>
      <h1 className="a-h1 agenda-serif">Diario personal</h1>
      <p className="a-sub">{new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}</p>
      <div className="a-card">
        <div style={{ marginBottom: 14 }}>
          <div className="a-stat-label">¿Cómo te sientes hoy?</div>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            {moods.map((m) => (
              <button
                key={m}
                onClick={() => update("mood", m)}
                style={{
                  fontSize: 20, background: entry.mood === m ? "var(--sage-dim)" : "var(--bg)",
                  border: "1px solid var(--line)", borderRadius: 10, width: 42, height: 42, cursor: "pointer",
                }}
              >{m}</button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div className="a-stat-label">Hoy agradezco</div>
          <input className="a-input" value={entry.gratitude} onChange={(e) => update("gratitude", e.target.value)} />
        </div>
        <div>
          <div className="a-stat-label">Notas del día</div>
          <textarea
            className="a-input" rows={5} value={entry.text}
            onChange={(e) => update("text", e.target.value)}
            style={{ resize: "vertical", fontFamily: "inherit" }}
          />
        </div>
      </div>
    </div>
  );
}

/* ================= NOTAS ================= */
function NotasTab({ data, patch }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const addNote = () => {
    if (!title.trim()) return;
    patch((d) => ({ notes: [{ id: uid(), title, content, date: todayISO() }, ...d.notes] }));
    setTitle(""); setContent("");
  };
  const delNote = (id) => patch((d) => ({ notes: d.notes.filter((n) => n.id !== id) }));

  return (
    <div>
      <h1 className="a-h1 agenda-serif">Notas</h1>
      <p className="a-sub">Ideas, recordatorios, lo que necesites anotar.</p>
      <div className="a-card" style={{ marginBottom: 16 }}>
        <input className="a-input" placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} style={{ marginBottom: 8 }} />
        <textarea className="a-input" rows={3} placeholder="Contenido..." value={content} onChange={(e) => setContent(e.target.value)} style={{ marginBottom: 8, fontFamily: "inherit" }} />
        <button className="a-btn" onClick={addNote}><Plus size={14} /> Guardar nota</button>
      </div>
      <div className="a-grid a-grid-2">
        {data.notes.map((n) => (
          <div className="a-card" key={n.id}>
            <div className="a-row">
              <div style={{ fontWeight: 600 }}>{n.title}</div>
              <Trash2 size={14} color="var(--text-faint)" style={{ cursor: "pointer" }} onClick={() => delNote(n.id)} />
            </div>
            <p className="a-sub" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{n.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= CALENDARIO ================= */
function CalendarioTab({ data, patch }) {
  const [date, setDate] = useState(todayISO());
  const [title, setTitle] = useState("");
  const events = data.priorities; // reutilizamos misma estructura de eventos simples por fecha
  const dayEvents = data.calendarEvents?.[date] || [];

  const addEvent = () => {
    if (!title.trim()) return;
    patch((d) => ({
      calendarEvents: {
        ...(d.calendarEvents || {}),
        [date]: [...((d.calendarEvents || {})[date] || []), { id: uid(), title }],
      },
    }));
    setTitle("");
  };
  const delEvent = (id) => {
    patch((d) => ({
      calendarEvents: {
        ...(d.calendarEvents || {}),
        [date]: (d.calendarEvents?.[date] || []).filter((e) => e.id !== id),
      },
    }));
  };

  return (
    <div>
      <h1 className="a-h1 agenda-serif">Agenda / Calendario</h1>
      <p className="a-sub">Eventos por fecha.</p>
      <div className="a-card">
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input className="a-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 170 }} />
          <input className="a-input" placeholder="Nuevo evento..." value={title} onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addEvent()} />
          <button className="a-btn" onClick={addEvent}><Plus size={14} /></button>
        </div>
        {dayEvents.length === 0 && <p className="a-sub">Sin eventos para esta fecha.</p>}
        {dayEvents.map((e) => (
          <div className="a-list-item" key={e.id}>
            <Calendar size={14} color="var(--text-soft)" />
            <span style={{ flex: 1 }}>{e.title}</span>
            <Trash2 size={14} color="var(--text-faint)" style={{ cursor: "pointer" }} onClick={() => delEvent(e.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= STATS ================= */
function StatsTab({ data, month, monthTx }) {
  const byCategory = {};
  monthTx.filter((t) => t.type === "egreso").forEach((t) => {
    byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
  });
  const totalEgresos = Object.values(byCategory).reduce((a, b) => a + b, 0) || 1;
  const habitRate = data.habits.length
    ? data.habits.reduce((s, h) => s + (h.log[todayISO()] ? 1 : 0), 0) / data.habits.length
    : 0;

  return (
    <div>
      <h1 className="a-h1 agenda-serif">Estadísticas</h1>
      <p className="a-sub">Vista rápida de {monthLabel(month)}.</p>

      <div className="a-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 14.5 }}>Desglose de egresos por categoría</h3>
        {Object.keys(byCategory).length === 0 && <p className="a-sub">Sin egresos registrados este mes.</p>}
        {Object.entries(byCategory).sort((a,b)=>b[1]-a[1]).map(([cat, amt]) => (
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

      <div className="a-card">
        <h3 style={{ marginTop: 0, fontSize: 14.5 }}>Cumplimiento de hábitos hoy</h3>
        <Ring pct={habitRate} color="var(--sage)" />
      </div>
    </div>
  );
}
