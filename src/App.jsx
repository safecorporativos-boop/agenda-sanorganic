import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "./supabaseClient";
import {
  Home, ListChecks, BookOpen, StickyNote, Calendar,
  Plus, Trash2, ChevronLeft, ChevronRight, X, Check, Flag, FolderKanban,
  Timer, Bell, Pencil, Play, Pause, RotateCcw, Settings, Upload, Download,
  Image as ImageIcon, Search, Cloud, CloudOff, LogOut, Loader2,
  Palette, Sun, Moon, Mail, Lock, MoreHorizontal
} from "lucide-react";

/* ---------------------------------------------------------
   MI AGENDA — SAN-ORGANIC
   Agenda personal enfocada: tareas del día, calendario,
   notas, metas, proyectos, diario, pomodoro y recordatorios.
   Se guarda en localStorage y se sincroniza en la nube con Supabase.
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

const startOfWeek = (isoDate) => {
  const d = new Date(isoDate + "T00:00:00");
  const day = d.getDay(); // 0=Dom
  const diff = day === 0 ? -6 : 1 - day; // retroceder hasta el lunes
  d.setDate(d.getDate() + diff);
  return d;
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
  objectives: [],
  projects: [],
  notes: [], // {id,title,content,date,color,done,tags:[]}
  journal: {}, // { 'YYYY-MM-DD': {mood, reflection, text} }
  calendarEvents: {}, // { 'YYYY-MM-DD': [{id,title,time}] }
  reminders: [], // {id,text,datetime,done}
  wallpaper: "", // URL de imagen de fondo (opcional)
  darkMode: false,
  colorPalette: "earthy", // 'earthy' | 'golden' | 'retro'
});

function useSyncedState(userId) {
  const [data, setData] = useState(() => {
    try {
      const raw = typeof window !== "undefined" && window.localStorage ? localStorage.getItem(STORAGE_KEY) : null;
      return raw ? { ...defaultData(), ...JSON.parse(raw) } : defaultData();
    } catch {
      return defaultData();
    }
  });
  const [syncStatus, setSyncStatus] = useState("idle"); // idle | syncing | synced | offline | error
  const remoteLoadedRef = useRef(false);

  // Al iniciar sesión: trae lo que haya guardado en la nube (o sube lo local si es la primera vez)
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    remoteLoadedRef.current = false;
    setSyncStatus("syncing");
    (async () => {
      try {
        const { data: row, error } = await supabase.from("agenda_data").select("data").eq("user_id", userId).maybeSingle();
        if (cancelled) return;
        if (error) throw error;
        if (row && row.data) {
          setData({ ...defaultData(), ...row.data });
        } else {
          await supabase.from("agenda_data").upsert({ user_id: userId, data });
        }
        remoteLoadedRef.current = true;
        setSyncStatus("synced");
      } catch {
        if (!cancelled) setSyncStatus("error");
        remoteLoadedRef.current = true; // igual dejamos trabajar en local
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // Siempre guarda una copia local instantánea (funciona offline)
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* memoria */ }
  }, [data]);

  // Sube los cambios a Supabase (con una pequeña espera para no saturar la red mientras escribes)
  useEffect(() => {
    if (!userId || !remoteLoadedRef.current) return;
    setSyncStatus("syncing");
    const t = setTimeout(async () => {
      try {
        const { error } = await supabase.from("agenda_data").upsert({ user_id: userId, data, updated_at: new Date().toISOString() });
        setSyncStatus(error ? "error" : "synced");
      } catch {
        setSyncStatus("offline");
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [data, userId]);

  return [data, setData, syncStatus];
}

const GlobalStyle = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

    /* ---------- Paletas de color (3 paletas fijas, elegidas en Ajustes) ----------
       Cada paleta define 5 tonos base (--p-*) con los hex exactos de la paleta.
       Todo lo demás (--bg, --sage, --clay, etc.) se deriva de esos 5 tonos, así que
       el resto de la interfaz (ya escrita en var(--sage), var(--text), etc.) cambia
       de color automáticamente sin tocar cada componente. */
    .agenda-root.palette-earthy {
      --p-bg:#F7E1D7; --p-surface:#DEDBD2; --p-accent:#B0C4B1; --p-accent2:#EDAFB8;
      --p-accent3: color-mix(in srgb, #4A5759 35%, #EDAFB8 65%); --p-text:#4A5759;
    }
    .agenda-root.palette-golden {
      --p-bg:#FFE1A8; --p-surface: color-mix(in srgb, #FFE1A8 60%, white 40%);
      --p-accent:#E26D5C; --p-accent2:#C9CBA3; --p-accent3:#723D46; --p-text:#472D30;
    }
    .agenda-root.palette-retro {
      --p-bg:#FFD9DA; --p-surface:#F3E1DD; --p-accent:#89023E; --p-accent2:#C7D9B7;
      --p-accent3:#CC7178; --p-text:#89023E;
    }
    .agenda-root {
      --bg: var(--p-bg); --bg-card: var(--p-surface);
      --bg-card-2: color-mix(in srgb, var(--p-surface) 88%, var(--p-text) 12%);
      --line: color-mix(in srgb, var(--p-text) 14%, transparent);
      --sage: var(--p-accent); --sage-dim: color-mix(in srgb, var(--p-accent) 15%, transparent);
      --butter: var(--p-accent2); --butter-dim: color-mix(in srgb, var(--p-accent2) 20%, transparent);
      --clay: var(--p-accent3); --clay-dim: color-mix(in srgb, var(--p-accent3) 15%, transparent);
      --text: var(--p-text);
      --text-soft: color-mix(in srgb, var(--p-text) 62%, var(--p-bg) 38%);
      --text-faint: color-mix(in srgb, var(--p-text) 38%, var(--p-bg) 62%);
      font-family:'Inter',sans-serif;
      background:var(--bg); color:var(--text);
      min-height:100vh; display:flex; border-radius:16px; overflow:hidden;
      box-shadow: 0 24px 70px rgba(43,32,24,0.16);
      transition: background .25s ease, color .25s ease;
    }
    .agenda-root.dark {
      --bg: color-mix(in srgb, var(--p-text) 85%, black 15%);
      --bg-card: color-mix(in srgb, var(--p-text) 70%, black 14%);
      --bg-card-2: color-mix(in srgb, var(--p-text) 58%, black 12%);
      --line: color-mix(in srgb, white 12%, transparent);
      --sage: color-mix(in srgb, var(--p-accent) 80%, white 20%);
      --sage-dim: color-mix(in srgb, var(--p-accent) 24%, transparent);
      --butter: color-mix(in srgb, var(--p-accent2) 78%, white 22%);
      --butter-dim: color-mix(in srgb, var(--p-accent2) 22%, transparent);
      --clay: color-mix(in srgb, var(--p-accent3) 80%, white 20%);
      --clay-dim: color-mix(in srgb, var(--p-accent3) 22%, transparent);
      --text: color-mix(in srgb, var(--p-bg) 88%, white 12%);
      --text-soft: color-mix(in srgb, var(--text) 70%, var(--bg) 30%);
      --text-faint: color-mix(in srgb, var(--text) 45%, var(--bg) 55%);
      box-shadow: 0 24px 70px rgba(0,0,0,0.5);
    }
    .agenda-root * { box-sizing:border-box; }
    .agenda-serif { font-family:'Fraunces', serif; font-optical-sizing: auto; }
    .agenda-mono { font-family:'IBM Plex Mono', monospace; }

    /* ---------- Barra de navegación inferior (celular, estilo app nativa) ---------- */
    .a-bottombar {
      display:none; position:fixed; left:0; right:0; bottom:0; z-index:80;
      background:var(--bg-card); border-top:1px solid var(--line);
      padding:8px 4px calc(8px + env(safe-area-inset-bottom, 0px));
      box-shadow: 0 -8px 24px -12px rgba(43,32,24,0.14);
    }
    .a-bottombar-row { display:flex; align-items:stretch; justify-content:space-around; }
    .a-bottombar-btn {
      display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px;
      background:transparent; border:none; color:var(--text-faint); font-size:10.5px; font-weight:600;
      padding:5px 6px; border-radius:12px; cursor:pointer; flex:1; min-width:0; transition:color .15s;
    }
    .a-bottombar-btn span { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
    .a-bottombar-btn.active { color:var(--sage); }
    .a-bottombar-btn .a-bottombar-icon-wrap {
      width:34px; height:26px; display:flex; align-items:center; justify-content:center; border-radius:10px; transition:background .15s;
    }
    .a-bottombar-btn.active .a-bottombar-icon-wrap { background:var(--sage-dim); }

    .a-more-overlay { display:none; position:fixed; inset:0; background:rgba(20,10,14,0.4); z-index:90; }
    .a-more-overlay.open { display:block; }
    .a-more-sheet {
      position:fixed; left:0; right:0; bottom:0; z-index:91; background:var(--bg-card);
      border-radius:22px 22px 0 0; padding:10px 18px calc(22px + env(safe-area-inset-bottom, 0px));
      box-shadow: 0 -20px 50px rgba(0,0,0,0.25); max-height:70vh; overflow-y:auto;
    }
    .a-more-handle { width:38px; height:4px; border-radius:99px; background:var(--line); margin:6px auto 16px; }
    .a-more-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
    .a-more-item {
      display:flex; flex-direction:column; align-items:center; gap:8px; padding:14px 6px; border-radius:16px;
      background:var(--bg); border:1px solid var(--line); color:var(--text); font-size:12px; font-weight:600; cursor:pointer;
    }
    .a-more-item .a-more-icon { width:42px; height:42px; border-radius:13px; background:var(--sage-dim); color:var(--sage); display:flex; align-items:center; justify-content:center; }

    /* Sidebar ancho agrupado — escritorio */
    .a-sidebar-desktop {
      width:220px; flex-shrink:0; background:var(--bg-card); border-right:1px solid var(--line);
      padding:20px 14px; overflow-y:auto; max-height:92vh; display:flex; flex-direction:column; gap:20px;
    }
    .a-sidebar-logo { display:flex; align-items:center; gap:8px; font-size:15px; font-weight:600; padding:0 8px; margin-bottom:4px; letter-spacing:.02em; }
    .a-sidebar-dot { width:9px; height:9px; border-radius:50%; background:var(--sage); flex-shrink:0; }
    .a-sidebar-group { display:flex; flex-direction:column; gap:2px; }
    .a-sidebar-grouplabel { font-size:10.5px; text-transform:uppercase; letter-spacing:.08em; color:var(--text-faint); font-weight:700; padding:0 8px; margin-bottom:6px; }
    .a-sidebar-item {
      display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:8px; border:none;
      background:transparent; color:var(--text-soft); font-size:13px; font-family:inherit; cursor:pointer;
      text-align:left; transition:all .12s; width:100%;
    }
    .a-sidebar-item:hover { background:var(--bg-card-2); color:var(--text); }
    .a-sidebar-item.active { background:var(--sage-dim); color:var(--sage); font-weight:700; }

    .a-main { flex:1; min-width:0; padding:36px 42px; overflow-y:auto; max-height:92vh; }
    .a-h1 { font-size:28px; font-weight:600; margin:0 0 5px; letter-spacing:-.01em; }
    .a-sub { color:var(--text-soft); font-size:13.5px; margin:0 0 28px; line-height:1.5; }

    .a-card {
      background:var(--bg-card); border:1px solid var(--line); border-radius:16px; padding:20px 22px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.02), 0 8px 24px -12px rgba(43,32,24,0.10);
      transition: box-shadow .2s ease, transform .2s ease, background .25s ease, border-color .25s ease;
    }
    .a-grid { display:grid; gap:16px; }
    .a-grid-3 { grid-template-columns:repeat(3,1fr); }
    .a-grid-2 { grid-template-columns:repeat(2,1fr); }
    .a-grid-4 { grid-template-columns:repeat(4,1fr); }
    .a-grid-7 { grid-template-columns:repeat(7,1fr); }
    .a-week-event { font-size:12.5px; }

    /* Grilla horaria semanal (escritorio) */
    .a-hourgrid-desktop { display:block; margin-bottom:16px; }
    .a-daygrid-mobile { display:none; }
    .a-hourgrid { display:grid; border:1px solid var(--line); border-radius:9px; overflow:hidden; background:var(--bg-card); }
    .a-hourgrid-corner { background:var(--bg-card-2); border-bottom:1px solid var(--line); border-right:1px solid var(--line); }
    .a-hourgrid-daylabel { background:var(--bg-card-2); border-bottom:1px solid var(--line); border-right:1px solid var(--line);
      font-size:11.5px; font-weight:700; text-transform:capitalize; text-align:center; padding:8px 4px; }
    .a-hourgrid-daylabel:last-child, .a-hourgrid-cell:last-child { border-right:none; }
    .a-hourgrid-hourlabel { border-top:1px solid var(--line); border-right:1px solid var(--line); background:var(--bg-card-2);
      font-size:10.5px; color:var(--text-soft); padding:6px 4px; text-align:right; font-family:'IBM Plex Mono',monospace; }
    .a-hourgrid-cell { border-top:1px solid var(--line); border-right:1px solid var(--line); min-height:30px; padding:2px; cursor:pointer; transition:background .1s; }
    .a-hourgrid-cell:hover { background:var(--bg-card-2); }
    .a-hourgrid-event { font-size:10px; background:var(--sage); color:#fff; border-radius:5px; padding:2px 5px; margin-bottom:2px; cursor:pointer; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .agenda-root.dark .a-hourgrid-event { color:#1c1418; }

    /* Agenda de un día (celular) */
    .a-daygrid-row { display:flex; border-bottom:1px solid var(--line); padding:8px 10px; gap:10px; cursor:pointer; }
    .a-daygrid-row:last-child { border-bottom:none; }
    .a-daygrid-hour { font-size:12px; color:var(--text-soft); font-family:'IBM Plex Mono',monospace; width:48px; flex-shrink:0; padding-top:2px; }
    .a-daygrid-content { flex:1; }
    .a-daygrid-placeholder { color:var(--text-faint); font-size:13px; }

    .a-monthgrid { gap:6px; }
    .a-monthcell { aspect-ratio:1; border-radius:9px; background:var(--bg-card); border:1px solid var(--line);
      display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; cursor:pointer; transition:all .12s; font-size:13px; }
    .a-monthcell:hover { background:var(--bg-card-2); }
    .a-monthcell.today { border:2px solid var(--sage); font-weight:700; color:var(--sage); }
    .a-monthcell.selected { background:var(--sage); color:#fff; border-color:var(--sage); }
    .agenda-root.dark .a-monthcell.selected { color:#1c1418; }
    .a-monthcell.selected.today { color:#fff; }
    .a-monthdot { width:5px; height:5px; border-radius:50%; background:var(--butter); }
    .a-monthcell.selected .a-monthdot { background:#fff; }
    .a-spin { animation: a-spin-anim 1s linear infinite; }
    @keyframes a-spin-anim { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }

    .a-stat-label { font-size:11px; text-transform:uppercase; letter-spacing:.07em; color:var(--text-soft); margin-bottom:6px;}

    .a-switch { position:relative; display:inline-block; width:44px; height:24px; flex-shrink:0; cursor:pointer; }
    .a-switch input { opacity:0; width:0; height:0; position:absolute; }
    .a-switch-track { position:absolute; inset:0; background:var(--line); border-radius:999px; transition:background .15s; }
    .a-switch-thumb { position:absolute; top:3px; left:3px; width:18px; height:18px; background:#fff; border-radius:50%; transition:transform .15s; box-shadow:0 1px 3px rgba(0,0,0,0.25); }
    .a-switch input:checked + .a-switch-track { background:var(--sage); }
    .a-switch input:checked + .a-switch-track .a-switch-thumb { transform:translateX(20px); }
    .a-stat-num { font-size:22px; font-weight:600; }

    .a-input, .a-select, textarea.a-input {
      background:var(--bg); border:1px solid var(--line); color:var(--text);
      border-radius:10px; padding:10px 12px; font-size:13.5px; font-family:inherit;
      width:100%; outline:none; transition:border-color .15s, box-shadow .15s;
    }
    .a-input:focus, .a-select:focus { border-color:var(--sage); box-shadow:0 0 0 3px var(--sage-dim); }

    .a-btn {
      background:var(--sage); color:#fff; border:none; border-radius:10px;
      padding:10px 18px; font-weight:700; font-size:13px; cursor:pointer;
      display:inline-flex; align-items:center; gap:6px;
      transition:opacity .15s, transform .12s, box-shadow .15s;
    }
    .a-btn:hover { opacity:.9; transform:translateY(-1px); box-shadow:0 6px 16px -6px var(--sage-dim); }
    .a-btn:active { transform:translateY(0); }
    .a-btn.secondary { background:var(--bg-card-2); color:var(--text); border:1px solid var(--line); box-shadow:none; }
    .a-btn.danger { background:var(--clay-dim); color:var(--clay); box-shadow:none; }
    .a-btn.icon { padding:9px; }
    .a-btn.xs { padding:6px 12px; font-size:11px; }
    .agenda-root.dark .a-btn:not(.secondary):not(.danger) { color:#1c1418; }

    /* ---------- Selector de paletas (Ajustes) ---------- */
    .a-palette-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:14px; }
    .a-palette-option {
      border:2px solid var(--line); border-radius:14px; padding:14px; cursor:pointer; text-align:left;
      background:var(--bg); transition:border-color .15s, transform .15s; display:flex; flex-direction:column; gap:10px;
    }
    .a-palette-option:hover { transform:translateY(-2px); }
    .a-palette-option.active { border-color:var(--sage); }
    .a-palette-swatches { display:flex; gap:6px; }
    .a-palette-swatch { width:22px; height:22px; border-radius:50%; border:1px solid rgba(0,0,0,0.08); flex-shrink:0; }
    .a-palette-name { font-size:13px; font-weight:700; display:flex; align-items:center; gap:6px; }
    .a-palette-preview { display:flex; align-items:center; gap:10px; padding:10px; border-radius:10px; }
    .a-palette-preview-btn { border:none; border-radius:8px; padding:7px 14px; font-size:11.5px; font-weight:700; color:#fff; }
    .a-palette-preview-card { flex:1; border-radius:8px; padding:8px 10px; font-size:10.5px; }

    /* ---------- Pantalla de acceso (login / registro) ---------- */
    .a-auth-shell { min-height:100vh; width:100%; display:flex; align-items:center; justify-content:center; padding:24px; }
    .a-auth-card {
      display:flex; width:100%; max-width:760px; border-radius:22px; overflow:hidden;
      box-shadow:0 30px 80px -20px rgba(43,32,24,0.28); border:1px solid var(--line);
    }
    .a-auth-brand {
      flex:1; min-width:0; padding:40px 34px; display:flex; flex-direction:column; justify-content:space-between;
      background: linear-gradient(160deg, var(--sage), var(--butter));
      color:#fff;
    }
    .agenda-root.dark .a-auth-brand { color:#1c1418; }
    .a-auth-brand-dot { width:11px; height:11px; border-radius:50%; background:rgba(255,255,255,0.85); margin-bottom:18px; }
    .a-auth-form-pane { flex:1; min-width:0; background:var(--bg-card); padding:40px 34px; }
    .a-auth-tabs { display:flex; gap:6px; margin-bottom:22px; background:var(--bg); padding:4px; border-radius:12px; border:1px solid var(--line); }
    .a-auth-tab { flex:1; border:none; background:transparent; padding:9px 10px; border-radius:9px; font-weight:700; font-size:12.5px; cursor:pointer; color:var(--text-soft); transition:all .15s; }
    .a-auth-tab.active { background:var(--sage); color:#fff; }
    .agenda-root.dark .a-auth-tab.active { color:#1c1418; }
    .a-auth-field { position:relative; margin-bottom:12px; }
    .a-auth-field svg { position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--text-faint); }
    .a-auth-field input { padding-left:36px; }
    .a-auth-banner { border-radius:10px; padding:9px 12px; font-size:12.5px; margin-bottom:12px; }
    .a-auth-banner.err { background:var(--clay-dim); color:var(--clay); }
    .a-auth-banner.ok { background:var(--sage-dim); color:var(--sage); }
    @media (max-width: 680px) {
      .a-auth-card { flex-direction:column; max-width:420px; }
      .a-auth-brand { padding:28px 26px; }
    }
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
    .agenda-root.dark .a-check.done { color:#1c1418; }

    .a-daychip { width:28px; height:28px; border-radius:8px; border:1px solid var(--line); background:var(--bg);
      display:flex; align-items:center; justify-content:center; font-size:10.5px; cursor:pointer; color:var(--text-soft); }
    .a-daychip.on { background:var(--sage); color:#fff; border-color:var(--sage); }

    .a-note { border-radius:10px; padding:14px; position:relative; min-height:120px; display:flex; flex-direction:column; }
    .a-tag { font-size:10px; padding:2px 8px; border-radius:999px; background:rgba(0,0,0,0.08); }

    @media (max-width: 760px) {
      .agenda-root { border-radius:0; }
      .a-sidebar-desktop { display:none; }
      .a-bottombar { display:block; }
      .a-main { max-height:100vh; padding:18px 14px calc(88px + env(safe-area-inset-bottom, 0px)); }
      .a-grid-3, .a-grid-4, .a-grid-2 { grid-template-columns:1fr; }
      .a-grid-7 { grid-template-columns:repeat(7,minmax(34px,1fr)); }
      .a-week-event { font-size:14.5px; }
      .a-h1 { font-size:22px; }
      .a-hourgrid-desktop { display:none; }
      .a-daygrid-mobile { display:block; }

      /* Letra más grande en general para celular (!important para ganarle a los tamaños puestos en línea) */
      .a-sub { font-size:14.5px !important; }
      .a-input, .a-select, textarea.a-input { font-size:15px; padding:10px 12px; }
      .a-btn { font-size:14px; padding:10px 16px; }
      .a-btn.xs { font-size:12.5px !important; padding:7px 12px; }
      .a-stat-label { font-size:12px !important; }
      .a-stat-num { font-size:24px; }
      .a-pill { font-size:12px !important; }
      .a-list-item { font-size:15px; }
      .a-note p, .a-note div { font-size:14px; }
      .a-hourgrid-event { font-size:12px !important; }
      .a-monthcell { font-size:15px !important; }
      .a-hourgrid-daylabel { font-size:13px !important; }
      .a-hourgrid-hourlabel { font-size:12.5px !important; }
      .a-daygrid-hour { font-size:14px !important; }
      .a-daygrid-placeholder { font-size:14px !important; }
      .a-tag { font-size:12px !important; }
      .a-daychip { font-size:12.5px !important; width:32px; height:32px; }
      .agenda-mono { font-size:inherit; }
      h3 { font-size:16px !important; }
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
  { id: "inicio", label: "Inicio", icon: Home, group: "Principal" },
  { id: "prioridades", label: "Tareas", icon: ListChecks, group: "Principal" },
  { id: "calendario", label: "Agenda", icon: Calendar, group: "Principal" },
  { id: "notas", label: "Notas", icon: StickyNote, group: "Principal" },
  { id: "proyectos", label: "Proyectos", icon: FolderKanban, group: "Trabajo" },
  { id: "objetivos", label: "Metas", icon: Flag, group: "Trabajo" },
  { id: "diario", label: "Diario", icon: BookOpen, group: "Personal" },
  { id: "pomodoro", label: "Pomodoro", icon: Timer, group: "Personal" },
  { id: "recordatorios", label: "Recordatorios", icon: Bell, group: "Personal" },
  { id: "ajustes", label: "Ajustes", icon: Settings, group: "Personal" },
];

const NAV_GROUP_ORDER = ["Principal", "Trabajo", "Personal"];
const BOTTOMBAR_IDS = ["inicio", "calendario", "prioridades", "notas"];

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

function AgendaApp({ session }) {
  const [data, setData, syncStatus] = useSyncedState(session?.user?.id);
  const [tab, setTab] = useState("inicio");
  const [searchQuery, setSearchQuery] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const pomodoro = usePomodoro();
  const notifiedRef = useRef(new Set());
  const colorPalette = data.colorPalette || "earthy";

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const out = [];
    data.notes.forEach((n) => { if (n.title.toLowerCase().includes(q) || (n.content || "").toLowerCase().includes(q)) out.push({ icon: StickyNote, label: n.title || "(sin título)", sub: "Nota", tab: "notas" }); });
    data.objectives.forEach((o) => { if (o.title.toLowerCase().includes(q)) out.push({ icon: Flag, label: o.title, sub: "Meta", tab: "objetivos" }); });
    data.projects.forEach((p) => { if (p.name.toLowerCase().includes(q)) out.push({ icon: FolderKanban, label: p.name, sub: "Proyecto", tab: "proyectos" }); });
    Object.entries(data.calendarEvents || {}).forEach(([date, evs]) => evs.forEach((e) => { if (e.title.toLowerCase().includes(q)) out.push({ icon: Calendar, label: e.title, sub: `Evento · ${date}`, tab: "calendario" }); }));
    data.reminders.forEach((r) => { if (r.text.toLowerCase().includes(q)) out.push({ icon: Bell, label: r.text, sub: "Recordatorio", tab: "recordatorios" }); });
    return out.slice(0, 8);
  }, [searchQuery, data]);

  const patch = (fn) => setData((d) => ({ ...d, ...fn(d) }));

  /* ---------- avisos del navegador para recordatorios vencidos (persiste entre pestañas) ---------- */
  useEffect(() => {
    const check = () => {
      try {
        if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
        const now = new Date();
        data.reminders.forEach((r) => {
          if (r.done || !r.datetime || notifiedRef.current.has(r.id)) return;
          if (new Date(r.datetime) <= now) {
            new Notification("Recordatorio — Mi Agenda", { body: r.text });
            notifiedRef.current.add(r.id);
          }
        });
      } catch {
        /* algunos navegadores restringen la API de notificaciones; lo ignoramos */
      }
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

  const moreItems = NAV.filter((n) => !BOTTOMBAR_IDS.includes(n.id));
  const moreActive = moreItems.some((n) => n.id === tab);

  return (
    <div className={`agenda-root palette-${colorPalette} ${data.darkMode ? "dark" : ""}`}>
      <GlobalStyle />
      <nav className="a-bottombar">
        <div className="a-bottombar-row">
          {NAV.filter((n) => BOTTOMBAR_IDS.includes(n.id)).map((n) => {
            const Icon = n.icon;
            const active = tab === n.id;
            return (
              <button key={n.id} className={`a-bottombar-btn ${active ? "active" : ""}`} onClick={() => { setTab(n.id); setMoreOpen(false); }}>
                <span className="a-bottombar-icon-wrap"><Icon size={19} /></span>
                <span>{n.label}</span>
              </button>
            );
          })}
          <button className={`a-bottombar-btn ${moreActive ? "active" : ""}`} onClick={() => setMoreOpen(true)} style={{ position: "relative" }}>
            <span className="a-bottombar-icon-wrap"><MoreHorizontal size={19} /></span>
            <span>Más</span>
            {pomodoro.running && (
              <span style={{ position: "absolute", top: 2, right: "28%", width: 7, height: 7, borderRadius: "50%", background: "var(--sage)" }} />
            )}
          </button>
        </div>
      </nav>

      <div className={`a-more-overlay ${moreOpen ? "open" : ""}`} onClick={() => setMoreOpen(false)} />
      {moreOpen && (
        <div className="a-more-sheet">
          <div className="a-more-handle" />
          <div className="a-more-grid">
            {moreItems.map((n) => {
              const Icon = n.icon;
              return (
                <button key={n.id} className="a-more-item" onClick={() => { setTab(n.id); setMoreOpen(false); }} style={{ position: "relative" }}>
                  <span className="a-more-icon"><Icon size={19} /></span>
                  {n.label}
                  {n.id === "pomodoro" && pomodoro.running && (
                    <span style={{ position: "absolute", top: 10, right: 14, width: 8, height: 8, borderRadius: "50%", background: "var(--sage)" }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <nav className="a-sidebar-desktop">
        <div className="a-sidebar-logo">
          <span className="a-sidebar-dot" />
          <span className="agenda-serif">SAN-ORGANIC</span>
        </div>
        {NAV_GROUP_ORDER.map((group) => (
          <div key={group} className="a-sidebar-group">
            <div className="a-sidebar-grouplabel">{group}</div>
            {NAV.filter((n) => n.group === group).map((n) => {
              const Icon = n.icon;
              return (
                <button key={n.id} className={`a-sidebar-item ${tab === n.id ? "active" : ""}`} onClick={() => setTab(n.id)} style={{ position: "relative" }}>
                  <Icon size={16} />
                  <span>{n.label}</span>
                  {n.id === "pomodoro" && pomodoro.running && (
                    <span style={{ position: "absolute", top: 10, right: 10, width: 6, height: 6, borderRadius: "50%", background: "var(--sage)" }} />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <main className="a-main">
        <div style={{ display: "flex", gap: 10, marginBottom: 22, alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={15} color="var(--text-faint)" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input
              className="a-input" placeholder="Buscar notas, proyectos, metas, eventos..."
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: 34 }}
            />
            {searchQuery.trim() && (
              <div className="a-card" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 50, padding: 8, maxHeight: 320, overflowY: "auto" }}>
                {searchResults.length === 0 && <p className="a-sub" style={{ margin: "6px 10px" }}>Sin resultados para "{searchQuery}".</p>}
                {searchResults.map((r, i) => {
                  const Icon = r.icon;
                  return (
                    <div key={i} className="a-list-item" style={{ cursor: "pointer", padding: "8px 10px" }} onClick={() => { setTab(r.tab); setSearchQuery(""); }}>
                      <Icon size={14} color="var(--text-soft)" />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13 }}>{r.label}</div>
                        <div className="a-sub" style={{ margin: 0, fontSize: 11 }}>{r.sub}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div title={syncStatus === "synced" ? "Sincronizado con la nube" : syncStatus === "syncing" ? "Sincronizando..." : syncStatus === "error" || syncStatus === "offline" ? "Sin conexión — guardado solo en este dispositivo por ahora" : ""} style={{ flexShrink: 0 }}>
            {syncStatus === "syncing" && <Loader2 size={17} color="var(--text-soft)" className="a-spin" />}
            {syncStatus === "synced" && <Cloud size={17} color="var(--sage)" />}
            {(syncStatus === "error" || syncStatus === "offline") && <CloudOff size={17} color="var(--clay)" />}
          </div>
        </div>
        {tab === "inicio" && (
          <InicioTab data={data} patch={patch} todayList={todayList} progressPct={progressPct} upcomingEvents={upcomingEvents} goToTab={setTab} />
        )}
        {tab === "prioridades" && <PrioridadesTab list={todayList} onAdd={addPriority} onToggle={togglePriority} onDelete={delPriority} />}
        {tab === "objetivos" && <ObjetivosTab data={data} patch={patch} />}
        {tab === "proyectos" && <ProyectosTab data={data} patch={patch} />}
        {tab === "diario" && <DiarioTab data={data} patch={patch} />}
        {tab === "notas" && <NotasTab data={data} patch={patch} />}
        {tab === "calendario" && <CalendarioTab data={data} patch={patch} />}
        {tab === "pomodoro" && <PomodoroTab {...pomodoro} />}
        {tab === "recordatorios" && <RecordatoriosTab data={data} patch={patch} />}
        {tab === "ajustes" && <AjustesTab data={data} patch={patch} setData={setData} session={session} />}
      </main>
    </div>
  );
}

/* ================= AUTENTICACIÓN (para sincronizar entre dispositivos) ================= */
function AuthScreen() {
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setNotice(""); setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setNotice("Cuenta creada. Si tu proyecto de Supabase pide confirmar el correo, revisa tu bandeja de entrada; si no, ya puedes iniciar sesión.");
      }
    } catch (err) {
      setError(err.message || "Algo salió mal. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="agenda-root palette-earthy a-auth-shell" style={{ boxShadow: "none", borderRadius: 0, background: "var(--bg)" }}>
      <GlobalStyle />
      <div className="a-auth-card">
        <div className="a-auth-brand agenda-serif">
          <div>
            <span className="a-auth-brand-dot" />
            <h1 style={{ fontSize: 28, margin: "0 0 8px" }}>Mi Agenda</h1>
            <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13.5, opacity: 0.9, lineHeight: 1.5, maxWidth: 260 }}>
              SAN-ORGANIC — tu agenda, notas, proyectos y metas en un mismo lugar, sincronizados en todos tus dispositivos.
            </p>
          </div>
          <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11.5, opacity: 0.75, margin: 0 }}>Agenda · Notas · Proyectos · Metas</p>
        </div>
        <div className="a-auth-form-pane">
          <div className="a-auth-tabs">
            <button type="button" className={`a-auth-tab ${mode === "login" ? "active" : ""}`} onClick={() => setMode("login")}>Iniciar sesión</button>
            <button type="button" className={`a-auth-tab ${mode === "signup" ? "active" : ""}`} onClick={() => setMode("signup")}>Crear cuenta</button>
          </div>
          <form onSubmit={submit}>
            <div className="a-auth-field">
              <Mail size={14} />
              <input className="a-input" type="email" required placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="a-auth-field">
              <Lock size={14} />
              <input className="a-input" type="password" required minLength={6} placeholder="Contraseña (mínimo 6 caracteres)" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <div className="a-auth-banner err">{error}</div>}
            {notice && <div className="a-auth-banner ok">{notice}</div>}
            <button className="a-btn" type="submit" disabled={loading} style={{ width: "100%", justifyContent: "center", marginTop: 4 }}>
              {loading ? "Un momento..." : mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ================= RAÍZ: controla sesión y decide qué mostrar ================= */
export default function Root() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setChecking(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  if (checking) {
    return (
      <div className="agenda-root palette-earthy" style={{ alignItems: "center", justifyContent: "center", padding: 40, boxShadow: "none", background: "var(--bg)" }}>
        <GlobalStyle />
        <Loader2 size={22} className="a-spin" color="var(--sage)" />
      </div>
    );
  }

  return session ? <AgendaApp session={session} /> : <AuthScreen />;
}

/* ================= INICIO ================= */
function InicioTab({ data, patch, todayList, progressPct, upcomingEvents, goToTab }) {
  const activeObjectives = data.objectives.filter((o) => (o.milestones || []).some((m) => !m.done) || (o.milestones || []).length === 0).slice(0, 2);
  const objectiveProgress = (o) => {
    const total = (o.milestones || []).length;
    const done = (o.milestones || []).filter((m) => m.done).length;
    return { done, total, pct: total ? done / total : 0 };
  };
  const [now, setNow] = useState(new Date());
  const [quickAdd, setQuickAdd] = useState(null); // 'tarea' | 'nota' | 'evento' | null
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const dayLabel = now.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
  const timeLabel = now.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  return (
    <div>
      <div className="a-row" style={{ alignItems: "flex-start", marginBottom: 4, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="a-h1 agenda-serif">{data.name ? `Hola, ${data.name} 🌿` : "Hola 🌿"}</h1>
          <p className="a-sub" style={{ marginBottom: 0, textTransform: "capitalize" }}>{dayLabel}</p>
        </div>
        <div className="a-card" style={{ padding: "10px 16px", textAlign: "right" }}>
          <div className="a-sub" style={{ margin: 0 }}>Hora actual</div>
          <div className="agenda-mono" style={{ fontSize: 20, fontWeight: 700 }}>{timeLabel}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "14px 0 20px" }}>
        <button className="a-btn xs" onClick={() => setQuickAdd("tarea")}><Plus size={12} /> Tarea</button>
        <button className="a-btn secondary xs" onClick={() => setQuickAdd("nota")}><Plus size={12} /> Nota</button>
        <button className="a-btn secondary xs" onClick={() => setQuickAdd("evento")}><Plus size={12} /> Evento</button>
      </div>

      {quickAdd && <QuickAddModal type={quickAdd} data={data} patch={patch} onClose={() => setQuickAdd(null)} />}

      <div className="a-grid a-grid-3" style={{ marginBottom: 16 }}>
        <div className="a-card">
          <div className="a-stat-label">Progreso del día</div>
          <div className="a-stat-num agenda-mono">{Math.round(progressPct * 100)}%</div>
        </div>
        <div className="a-card">
          <div className="a-stat-label">Tareas de hoy</div>
          <div className="a-stat-num agenda-mono">{todayList.filter(t => t.done).length}/{todayList.length}</div>
        </div>
        <div className="a-card">
          <div className="a-stat-label">Próximos eventos</div>
          <div className="a-stat-num agenda-mono">{upcomingEvents.length}</div>
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

      {activeObjectives.length > 0 && (
        <div className="a-card">
          <div className="a-row" style={{ marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>Tus metas</h3>
            <button className="a-btn secondary" onClick={() => goToTab("objetivos")} style={{ fontSize: 11.5 }}>Ver todas</button>
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {activeObjectives.map((o) => {
              const p = objectiveProgress(o);
              return (
                <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Ring pct={p.pct} color={p.pct >= 1 ? "var(--sage)" : "var(--butter)"} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{o.title}</div>
                    <div className="a-sub" style={{ margin: 0 }}>{p.done}/{p.total || "—"} hitos</div>
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

/* ================= QUICK ADD (atajos desde Inicio) ================= */
function QuickAddModal({ type, data, patch, onClose }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [evDate, setEvDate] = useState(todayISO());
  const [evTime, setEvTime] = useState("");

  const titles = { tarea: "Nueva tarea de hoy", nota: "Nueva nota", evento: "Nuevo evento" };

  const save = () => {
    if (type === "tarea") {
      if (!title.trim()) return;
      const today = todayISO();
      patch((d) => ({ priorities: { ...d.priorities, [today]: [...(d.priorities[today] || []), { id: uid(), text: title, done: false }] } }));
    } else if (type === "nota") {
      if (!title.trim()) return;
      patch((d) => ({ notes: [{ id: uid(), title, content, date: todayISO(), color: "#ffffff", done: false, tags: [] }, ...d.notes] }));
    } else if (type === "evento") {
      if (!title.trim()) return;
      patch((d) => ({ calendarEvents: { ...(d.calendarEvents || {}), [evDate]: [...((d.calendarEvents || {})[evDate] || []), { id: uid(), title, time: evTime }] } }));
    }
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,10,14,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }} onClick={onClose}>
      <div className="a-card" style={{ width: "100%", maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
        <div className="a-row" style={{ marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>{titles[type]}</h3>
          <X size={16} style={{ cursor: "pointer" }} onClick={onClose} />
        </div>

        {type === "tarea" && (
          <input className="a-input" placeholder="¿Qué necesitas hacer hoy?" value={title} onChange={(e) => setTitle(e.target.value)} style={{ marginBottom: 8 }} autoFocus />
        )}

        {type === "nota" && (
          <>
            <input className="a-input" placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} style={{ marginBottom: 8 }} autoFocus />
            <textarea className="a-input" rows={3} placeholder="Contenido..." value={content} onChange={(e) => setContent(e.target.value)} style={{ marginBottom: 8, fontFamily: "inherit" }} />
          </>
        )}

        {type === "evento" && (
          <>
            <input className="a-input" placeholder="Título del evento" value={title} onChange={(e) => setTitle(e.target.value)} style={{ marginBottom: 8 }} autoFocus />
            <div className="a-grid a-grid-2" style={{ marginBottom: 8 }}>
              <input className="a-input" type="date" value={evDate} onChange={(e) => setEvDate(e.target.value)} />
              <input className="a-input" type="time" value={evTime} onChange={(e) => setEvTime(e.target.value)} />
            </div>
          </>
        )}

        <button className="a-btn" onClick={save} style={{ width: "100%", justifyContent: "center" }}>Guardar</button>
      </div>
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
  const [selectedMonthDay, setSelectedMonthDay] = useState(todayISO());
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
          <div className="a-grid a-grid-7" style={{ marginBottom: 8 }}>
            {["L", "M", "X", "J", "V", "S", "D"].map((letter, i) => (
              <div key={i} className="a-sub" style={{ textAlign: "center", margin: 0, fontWeight: 700 }}>{letter}</div>
            ))}
          </div>
          <div className="a-grid a-grid-7 a-monthgrid">
            {monthCells.map((d) => {
              const iso = toISO(d);
              const inMonth = d.getMonth() === monthDate.getMonth();
              const evs = eventsFor(iso);
              const isToday = iso === todayISO();
              const isSelected = iso === selectedMonthDay;
              return (
                <div key={iso}
                  className={`a-monthcell ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}`}
                  style={{ opacity: inMonth ? 1 : 0.35 }}
                  onClick={() => { setFormDate(iso); setSelectedMonthDay(iso); }}>
                  <span className="agenda-mono">{d.getDate()}</span>
                  {evs.length > 0 && <span className="a-monthdot" />}
                </div>
              );
            })}
          </div>

          {selectedMonthDay && (
            <div className="a-card" style={{ marginTop: 14 }}>
              <div className="a-row" style={{ marginBottom: 8 }}>
                <h3 style={{ margin: 0, fontSize: 14, textTransform: "capitalize" }}>
                  {new Date(selectedMonthDay + "T00:00:00").toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
                </h3>
                <X size={14} color="var(--text-faint)" style={{ cursor: "pointer" }} onClick={() => setSelectedMonthDay(null)} />
              </div>
              {eventsFor(selectedMonthDay).length === 0 && <p className="a-sub">Sin eventos este día. Usa "Nuevo evento" arriba (ya quedó con esta fecha lista).</p>}
              {eventsFor(selectedMonthDay).map((e) => (
                <div key={e.id} className="a-list-item">
                  <span style={{ flex: 1, fontSize: 13.5 }}>{e.time ? `${e.time} · ` : ""}{e.title}</span>
                  <Trash2 size={14} color="var(--text-faint)" style={{ cursor: "pointer" }} onClick={() => delEvent(selectedMonthDay, e.id)} />
                </div>
              ))}
            </div>
          )}
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
  const [notifStatus, setNotifStatus] = useState(() => {
    try {
      return typeof Notification !== "undefined" ? Notification.permission : "unsupported";
    } catch {
      return "unsupported";
    }
  });

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
            <button className="a-btn secondary xs" onClick={() => { try { Notification.requestPermission().then(setNotifStatus); } catch { alert("Este navegador no permite activar notificaciones."); } }}>
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

/* ================= AJUSTES (personalización y datos) ================= */
const PALETTES = [
  { id: "earthy", name: "Earthy Tones", swatches: ["#EDAFB8", "#F7E1D7", "#DEDBD2", "#B0C4B1", "#4A5759"], accent: "#B0C4B1", surface: "#DEDBD2", text: "#4A5759" },
  { id: "golden", name: "Golden Peachy Glow", swatches: ["#C9CBA3", "#FFE1A8", "#E26D5C", "#723D46", "#472D30"], accent: "#E26D5C", surface: "#FFE1A8", text: "#472D30" },
  { id: "retro", name: "Retro Vibes", swatches: ["#89023E", "#CC7178", "#FFD9DA", "#F3E1DD", "#C7D9B7"], accent: "#89023E", surface: "#F3E1DD", text: "#89023E" },
];

function AjustesTab({ data, patch, setData, session }) {
  const [wallpaperInput, setWallpaperInput] = useState(data.wallpaper || "");
  const fileInputRef = useRef(null);
  const currentPalette = data.colorPalette || "earthy";

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
    if (!confirm("Esto borra TODOS tus datos (tareas, notas, agenda, todo) y no se puede deshacer. ¿Seguro que quieres continuar?")) return;
    setData(defaultData());
  };

  return (
    <div>
      <h1 className="a-h1 agenda-serif">Ajustes</h1>
      <p className="a-sub">Personalización y gestión de tus datos.</p>

      <div className="a-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 14.5 }}><Cloud size={15} style={{ verticalAlign: -2 }} /> Cuenta y sincronización</h3>
        <p className="a-sub">Conectado como <b>{session?.user?.email}</b>. Tus datos se sincronizan automáticamente entre todos los dispositivos donde inicies sesión con esta cuenta.</p>
        <button className="a-btn danger xs" onClick={() => supabase.auth.signOut()}><LogOut size={13} /> Cerrar sesión</button>
      </div>

      <div className="a-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 14.5 }}>Tu nombre</h3>
        <input className="a-input" placeholder="¿Cómo quieres que te salude la agenda?" value={data.name} onChange={(e) => saveName(e.target.value)} style={{ maxWidth: 320 }} />
      </div>

      <div className="a-card" style={{ marginBottom: 16 }}>
        <div className="a-row">
          <div>
            <h3 style={{ margin: 0, fontSize: 14.5, display: "flex", alignItems: "center", gap: 6 }}>
              {data.darkMode ? <Moon size={15} /> : <Sun size={15} />} Modo oscuro
            </h3>
            <p className="a-sub" style={{ margin: "4px 0 0" }}>Cambia la versión clara de tu paleta por una versión oscura.</p>
          </div>
          <label className="a-switch">
            <input type="checkbox" checked={!!data.darkMode} onChange={(e) => patch(() => ({ darkMode: e.target.checked }))} />
            <span className="a-switch-track"><span className="a-switch-thumb" /></span>
          </label>
        </div>
      </div>

      <div className="a-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 14.5 }}><Palette size={15} style={{ verticalAlign: -2 }} /> Paleta de colores</h3>
        <p className="a-sub">Elige los tonos de toda la app. Se aplica al instante y se guarda en tu cuenta.</p>
        <div className="a-palette-grid">
          {PALETTES.map((p) => {
            const active = currentPalette === p.id;
            return (
              <button
                key={p.id}
                className={`a-palette-option ${active ? "active" : ""}`}
                onClick={() => patch(() => ({ colorPalette: p.id }))}
                type="button"
              >
                <div className="a-row">
                  <span className="a-palette-name">{active && <Check size={13} color="var(--sage)" />} {p.name}</span>
                </div>
                <div className="a-palette-swatches">
                  {p.swatches.map((hex) => <span key={hex} className="a-palette-swatch" style={{ background: hex }} />)}
                </div>
                <div className="a-palette-preview" style={{ background: p.surface }}>
                  <span className="a-palette-preview-btn" style={{ background: p.accent }}>Botón</span>
                  <span className="a-palette-preview-card" style={{ background: "rgba(255,255,255,0.55)", color: p.text }}>Vista previa de card</span>
                </div>
              </button>
            );
          })}
        </div>
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

