import React, { useState, useEffect, useRef } from "react";
import { Dumbbell, Plus, ChevronRight, ArrowLeft, Check, X, Eye, EyeOff, Trophy, Trash2, Star, Pencil, Share2, FolderClock, Download, Save, Copy, Sparkles, ChevronDown, ChevronUp, Timer, Play, Pause, RotateCcw, Calculator } from "lucide-react";
import { auth, db } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from "firebase/firestore";

function generateShareCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

const ACCENTS = {
  coral: { name: "Coral", from: "#ff7a54", to: "#e0562f", solid: "#ff7a54", text: "#1a1512" },
  azul: { name: "Azul", from: "#5b8dff", to: "#3457d6", solid: "#5b8dff", text: "#0d1730" },
  verde: { name: "Verde", from: "#3ecf8e", to: "#1f9d68", solid: "#3ecf8e", text: "#07241a" },
  rosa: { name: "Rosa", from: "#ff6fa5", to: "#d93d74", solid: "#ff6fa5", text: "#2a0916" },
  purpura: { name: "Púrpura", from: "#a480ff", to: "#7248d6", solid: "#a480ff", text: "#160b2e" },
  amarillo: { name: "Amarillo", from: "#ffd166", to: "#e0a92e", solid: "#ffd166", text: "#2e2100" },
  turquesa: { name: "Turquesa", from: "#2dd4bf", to: "#0f9488", solid: "#2dd4bf", text: "#04211d" },
  indigo: { name: "Índigo", from: "#818cf8", to: "#4f46e5", solid: "#818cf8", text: "#141a3d" },
  lima: { name: "Lima", from: "#a3e635", to: "#79ba13", solid: "#a3e635", text: "#1c2a04" },
  grafito: { name: "Grafito", from: "#94a3b8", to: "#64748b", solid: "#94a3b8", text: "#12181f" },
};

const ACCENT_STORAGE_KEY = "mirutina_accent";
// Guarda qué día se está entrenando y qué ejercicios ya se marcaron, para
// que no se pierda si recargas la página o bloqueas el celular a mitad de la rutina.
const TRAINING_STORAGE_KEY = "mirutina_training";

// Historial de cambios que se muestra en "Ver últimas actualizaciones".
// Para agregar uno nuevo, súmalo arriba de la lista (el más reciente primero).
const UPDATES = [
  { date: "11 sept 2026", text: "Nuevo botón Resumen en tu rutina: te suma cuántas series haces a la semana por categoría." },
  { date: "10 sept 2026", text: "Nuevo temporizador de descanso y calculadora de 1RM dentro de cada ejercicio." },
  { date: "10 sept 2026", text: "Ahora puedes cambiar el color de toda la app y el nombre que se ve en el inicio, desde el lápiz de arriba." },
  { date: "3 sept 2026", text: "Se puede compartir tu rutina con un código para que un amigo la importe." },
  { date: "28 ago 2026", text: "Los ejercicios personalizados ahora se marcan con una estrella." },
];

// Color activo del usuario. Se actualiza al inicio de cada render de <App>
// para que PrimaryButton, DashedButton y PillButton (definidos abajo, fuera
// de App) puedan pintarse con el color elegido sin recibirlo por props.
let CURRENT_ACCENT = ACCENTS.coral;

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function todayDayKey() {
  const map = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  return map[new Date().getDay()];
}

const DAYS = [
  { key: "lunes", label: "Lunes" },
  { key: "martes", label: "Martes" },
  { key: "miercoles", label: "Miércoles" },
  { key: "jueves", label: "Jueves" },
  { key: "viernes", label: "Viernes" },
  { key: "sabado", label: "Sábado" },
  { key: "domingo", label: "Domingo" },
];

const CATEGORIES = [
  { key: "pecho", label: "Pecho", exercises: ["Press plano con barra", "Press plano con mancuernas", "Press inclinado con barra", "Press inclinado con mancuernas", "Press en máquina", "Aperturas", "Cruce de poleas", "Fondos en paralelas"] },
  { key: "espalda", label: "Espalda", exercises: ["Peso muerto espalda", "Dominadas", "Jalón al pecho", "Remo con barra", "Remo con mancuerna", "Pullover en polea", "Hiperextensiones"] },
  { key: "biceps", label: "Bíceps", exercises: ["Curl con barra", "Curl con mancuernas", "Curl martillo", "Curl predicador", "Curl concentrado", "Curl en máquina"] },
  { key: "triceps", label: "Tríceps", exercises: ["Press cerrado", "Fondos para tríceps", "Extensión de tríceps en polea", "Press francés", "Patada de tríceps"] },
  { key: "hombros", label: "Hombros", exercises: ["Press militar con barra", "Press militar con mancuernas", "Press Arnold", "Elevaciones laterales", "Elevaciones frontales", "Pájaros (posterior)", "Face pull en polea"] },
  { key: "cuadriceps", label: "Cuádriceps", exercises: ["Sentadilla libre", "Sentadilla Hack", "Sentadilla Smith", "Prensa", "Extensión de piernas", "Sentadilla frontal", "Zancadas", "Búlgara"] },
  { key: "femorales", label: "Femorales", exercises: ["Peso muerto", "Curl femoral sentado", "Curl femoral acostado", "Curl femoral de pie"] },
  { key: "gluteos", label: "Glúteos", exercises: ["Hip Thrust", "Patada de glúteo en polea", "Adducción", "Abducción", "Sentadilla profunda", "Búlgara"] },
  { key: "abdomen", label: "Abdomen", exercises: ["Crunch", "Elevación de piernas", "Plancha", "Abdominales en polea", "Rueda abdominal", "Crunch en máquina"] },
  { key: "gemelos", label: "Gemelos", exercises: ["Elevación de talones de pie", "Elevación de talones sentado", "Elevación de talones en prensa"] },
  { key: "antebrazo", label: "Antebrazo", exercises: ["Curl de muñeca", "Curl de muñeca inverso", "Farmer walk"] },
  { key: "cardio", label: "Cardio", exercises: ["Cinta", "Bicicleta estática", "Elíptica", "Remo", "Escaladora", "Saltar la cuerda"] },
];

// Igual que CATEGORIES pero con "Otro" al final, para clasificar ejercicios
// personalizados que no encajan en ningún grupo muscular. Solo se usa para
// clasificar ejercicios, no para elegir la rutina de un día.
const EXERCISE_CATEGORIES = [...CATEGORIES, { key: "otro", label: "Otro", exercises: [] }];

function slugify(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Mapa inverso: de qué categoría es cada ejercicio "de catálogo" (fx-...),
// para poder sumar series por categoría real del ejercicio, no por la
// categoría del día (un día de Pecho puede tener ejercicios de Tríceps).
const FIXED_EXERCISE_CATEGORY = {};
CATEGORIES.forEach((cat) => {
  cat.exercises.forEach((name) => {
    FIXED_EXERCISE_CATEGORY["fx-" + slugify(name)] = cat.key;
  });
});

function categoryLabel(key) {
  if (key === "descanso") return "Descanso";
  if (key === "personalizada") return "Personalizada";
  return CATEGORIES.find((c) => c.key === key)?.label || "";
}

function prOf(ex) {
  const recs = ex.records || [];
  if (!recs.length) return null;
  return Math.max(...recs.map((r) => Number(r.peso) || 0));
}

function sortByFecha(arr) {
  return [...arr].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}

const REST_PRESETS = [60, 90, 120];

function epley1RM(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (w <= 0 || r <= 0) return null;
  if (r === 1) return w;
  return w * (1 + r / 30);
}

function fmtSeconds(s) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

// ---------- small UI atoms ----------
function PillButton({ children, onClick, subtitle, compact, muted, starred, onEdit, onDelete, onCheck, checked, highlighted }) {
  const btn = (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: compact ? "11px 16px" : "16px 18px",
        borderRadius: compact ? 16 : 999,
        border: checked ? `1px solid ${CURRENT_ACCENT.solid}` : highlighted ? `1.5px solid ${CURRENT_ACCENT.solid}` : "1px solid #33312e",
        background: checked ? `${CURRENT_ACCENT.solid}26` : highlighted ? "#2a1d15" : "#1f1e1c",
        color: "#f2ede6",
        fontSize: 16,
        fontWeight: 500,
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
          {starred && <Star size={13} color={CURRENT_ACCENT.solid} fill={CURRENT_ACCENT.solid} style={{ flexShrink: 0 }} />}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</span>
        </div>
        {subtitle && (
          <div style={{ fontSize: 12.5, color: muted ? "#6e6a65" : "#a39d95", marginTop: 3 }}>{subtitle}</div>
        )}
      </span>
      <ChevronRight size={18} color="#6e6a65" style={{ flexShrink: 0 }} />
    </button>
  );
  if (!onEdit && !onDelete && !onCheck) return <div style={{ marginBottom: compact ? 8 : 10 }}>{btn}</div>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: compact ? 8 : 10 }}>
      {onCheck && (
        <button
          onClick={onCheck}
          style={{
            width: 38,
            height: 38,
            flexShrink: 0,
            borderRadius: "50%",
            border: checked ? "none" : "1.5px solid #4a4640",
            background: checked ? CURRENT_ACCENT.solid : "transparent",
            color: checked ? CURRENT_ACCENT.text : "#5c5851",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Check size={16} strokeWidth={3} />
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>{btn}</div>
      {onEdit && (
        <button
          onClick={onEdit}
          style={{ width: 32, flexShrink: 0, border: "none", background: "transparent", color: "#5c5851", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <Pencil size={14} />
        </button>
      )}
      {onDelete && (
        <button
          onClick={onDelete}
          style={{ width: 32, flexShrink: 0, border: "none", background: "transparent", color: "#5c5851", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
}

function Field({ label, ...props }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <div style={{ fontSize: 12.5, color: "#a39d95", marginBottom: 6, fontWeight: 500, letterSpacing: 0.2 }}>{label}</div>
      <input
        {...props}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "13px 14px",
          borderRadius: 12,
          border: "1px solid #35322e",
          background: "#1a1917",
          color: "#f2ede6",
          fontSize: 15.5,
          outline: "none",
        }}
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <div style={{ fontSize: 12.5, color: "#a39d95", marginBottom: 6, fontWeight: 500, letterSpacing: 0.2 }}>{label}</div>
      <select
        value={value}
        onChange={onChange}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "13px 14px",
          borderRadius: 12,
          border: "1px solid #35322e",
          background: "#1a1917",
          color: "#f2ede6",
          fontSize: 15.5,
          outline: "none",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function PrimaryButton({ children, onClick, disabled, style }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        padding: "14px 18px",
        borderRadius: 999,
        border: "none",
        background: disabled ? "#4a3a30" : CURRENT_ACCENT.solid,
        color: CURRENT_ACCENT.text,
        fontSize: 16,
        fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function DashedButton({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "13px 18px",
        borderRadius: 999,
        border: "1.5px dashed #4a4640",
        background: "transparent",
        color: CURRENT_ACCENT.solid,
        fontSize: 14.5,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function TopBar({ title, onBack }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22, minHeight: 30 }}>
      {onBack && (
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#c9c4bd", cursor: "pointer", padding: 4, display: "flex" }}>
          <ArrowLeft size={22} />
        </button>
      )}
      {title && <div style={{ fontSize: 15, fontWeight: 600, color: "#c9c4bd" }}>{title}</div>}
    </div>
  );
}

function RestTimerOverlay({ accent, presetIndex, onPickPreset, secondsLeft, running, onToggleRunning, onReset, onClose }) {
  const total = REST_PRESETS[presetIndex];
  const progress = total > 0 ? (total - secondsLeft) / total : 0;
  const radius = 42;
  const circ = 2 * Math.PI * radius;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(15,14,13,0.92)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        zIndex: 50,
      }}
    >
      <button onClick={onClose} style={{ position: "absolute", top: 18, right: 18, background: "none", border: "none", color: "#8a8580", cursor: "pointer" }}>
        <X size={22} />
      </button>

      <div style={{ display: "flex", gap: 8 }}>
        {REST_PRESETS.map((p, i) => (
          <button
            key={p}
            onClick={() => onPickPreset(i)}
            style={{
              padding: "5px 12px",
              borderRadius: 999,
              border: i === presetIndex ? `1px solid ${accent.solid}` : "1px solid #33312e",
              background: i === presetIndex ? "#2a1d15" : "transparent",
              color: i === presetIndex ? accent.solid : "#8a8580",
              fontSize: 12.5,
              cursor: "pointer",
            }}
          >
            {p}s
          </button>
        ))}
      </div>

      <div style={{ position: "relative", width: 160, height: 160 }}>
        <svg width="160" height="160" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="80" cy="80" r={radius} fill="none" stroke="#2a2824" strokeWidth="8" />
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke={accent.solid}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - progress)}
            style={{ transition: "stroke-dashoffset 1s linear" }}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 700 }}>
          {fmtSeconds(secondsLeft)}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <button
          onClick={onReset}
          style={{ width: 46, height: 46, borderRadius: "50%", border: "1px solid #33312e", background: "#1f1e1c", color: "#c9c4bd", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <RotateCcw size={18} />
        </button>
        <button
          onClick={onToggleRunning}
          style={{ width: 62, height: 62, borderRadius: "50%", border: "none", background: accent.solid, color: accent.text, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          {running ? <Pause size={24} /> : <Play size={24} />}
        </button>
      </div>
    </div>
  );
}

function Calc1RMOverlay({ accent, weight, reps, onWeightChange, onRepsChange, onClose }) {
  const est = epley1RM(weight, reps);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(15,14,13,0.92)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 26px",
        zIndex: 50,
      }}
    >
      <button onClick={onClose} style={{ position: "absolute", top: 18, right: 18, background: "none", border: "none", color: "#8a8580", cursor: "pointer" }}>
        <X size={22} />
      </button>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 18 }}>Calculadora de 1RM</div>

      <label style={{ display: "block", marginBottom: 14 }}>
        <div style={{ fontSize: 12.5, color: "#a39d95", marginBottom: 6 }}>Peso usado (kg)</div>
        <input
          type="number"
          value={weight}
          onChange={(e) => onWeightChange(e.target.value)}
          placeholder="Ej. 70"
          style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 14, border: "1px solid #33312e", background: "#1a1917", color: "#f2ede6", fontSize: 15 }}
        />
      </label>
      <label style={{ display: "block", marginBottom: 18 }}>
        <div style={{ fontSize: 12.5, color: "#a39d95", marginBottom: 6 }}>Repeticiones hechas</div>
        <input
          type="number"
          value={reps}
          onChange={(e) => onRepsChange(e.target.value)}
          placeholder="Ej. 8"
          style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 14, border: "1px solid #33312e", background: "#1a1917", color: "#f2ede6", fontSize: 15 }}
        />
      </label>

      <div style={{ borderRadius: 16, background: "#1f1e1c", border: "1px solid #2a2824", padding: "16px 18px", textAlign: "center" }}>
        <div style={{ fontSize: 11.5, color: "#8a8580", marginBottom: 4 }}>1RM estimado</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: est ? accent.solid : "#5c5851" }}>{est ? `${est.toFixed(1)} kg` : "—"}</div>
      </div>
      <div style={{ fontSize: 11, color: "#6e6a65", marginTop: 10, textAlign: "center" }}>Fórmula de Epley: estimado, no un máximo real.</div>
    </div>
  );
}

function SuccessOverlay({ message }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(15,14,13,0.88)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, zIndex: 50, animation: "fadeIn 0.18s ease-out" }}>
      <div style={{ width: 64, height: 64, borderRadius: "50%", background: CURRENT_ACCENT.solid, display: "flex", alignItems: "center", justifyContent: "center", animation: "popIn 0.35s cubic-bezier(.34,1.56,.64,1)" }}>
        <Check size={32} color={CURRENT_ACCENT.text} strokeWidth={3} />
      </div>
      <div style={{ color: "#f2ede6", fontSize: 15, fontWeight: 500 }}>{message}</div>
      <style>{`
        @keyframes popIn { 0% { transform: scale(0.4); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes fadeIn { 0% { opacity: 0; } 100% { opacity: 1; } }
      `}</style>
    </div>
  );
}

function NewRecordOverlay({ exerciseName, before, after }) {
  const diff = after - before;
  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(15,14,13,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, zIndex: 50, animation: "fadeIn 0.18s ease-out", textAlign: "center", padding: "0 24px" }}>
      <div style={{ width: 84, height: 84, borderRadius: "50%", background: `${CURRENT_ACCENT.solid}22`, border: `1.5px solid ${CURRENT_ACCENT.solid}`, display: "flex", alignItems: "center", justifyContent: "center", animation: "popIn 0.4s cubic-bezier(.34,1.56,.64,1)", marginBottom: 8 }}>
        <Trophy size={38} color={CURRENT_ACCENT.solid} />
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: CURRENT_ACCENT.solid }}>¡Nuevo récord!</div>
      <div style={{ fontSize: 14.5, color: "#a39d95", marginBottom: 4 }}>{exerciseName}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: 16, color: "#8a8580", textDecoration: "line-through" }}>{before} kg</span>
        <span style={{ color: "#6e6a65", fontSize: 15 }}>→</span>
        <span style={{ fontSize: 26, fontWeight: 700, color: "#f2ede6" }}>{after} kg</span>
      </div>
      <div style={{ marginTop: 4, padding: "4px 12px", borderRadius: 999, background: `${CURRENT_ACCENT.solid}22`, color: CURRENT_ACCENT.solid, fontSize: 13, fontWeight: 700 }}>
        +{diff} kg
      </div>
      <style>{`
        @keyframes popIn { 0% { transform: scale(0.4); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes fadeIn { 0% { opacity: 0; } 100% { opacity: 1; } }
      `}</style>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("login");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);
  const [recordCelebration, setRecordCelebration] = useState(null); // { exerciseName, before, after }
  const [showPw, setShowPw] = useState(false);
  const [accentPickerOpen, setAccentPickerOpen] = useState(false);
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [displayNameValue, setDisplayNameValue] = useState("");
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [allUpdatesOpen, setAllUpdatesOpen] = useState(false);

  const [restTimerOpen, setRestTimerOpen] = useState(false);
  const [restPresetIndex, setRestPresetIndex] = useState(1);
  const [restSecondsLeft, setRestSecondsLeft] = useState(REST_PRESETS[1]);
  const [restRunning, setRestRunning] = useState(false);
  const restIntervalRef = useRef(null);

  const [calc1rmOpen, setCalc1rmOpen] = useState(false);
  const [calcWeight, setCalcWeight] = useState("");
  const [calcReps, setCalcReps] = useState("");

  const [currentUser, setCurrentUser] = useState(null);
  const [rutina, setRutina] = useState({});
  const [exercisesMap, setExercisesMap] = useState({});
  const [customRoutinesMap, setCustomRoutinesMap] = useState({});
  const [currentDayKey, setCurrentDayKey] = useState(null);
  const [changingCategory, setChangingCategory] = useState(false);
  const [customLabelInput, setCustomLabelInput] = useState("");
  const [renamingRoutineId, setRenamingRoutineId] = useState(null);
  const [currentExercise, setCurrentExercise] = useState(null);
  const [pendingExerciseName, setPendingExerciseName] = useState(null);
  const [pendingExerciseId, setPendingExerciseId] = useState(null);
  const [editExercise, setEditExercise] = useState(false);
  const [editRecordId, setEditRecordId] = useState(null);
  const [trainingDayKey, setTrainingDayKey] = useState(() => {
    try {
      const raw = localStorage.getItem(TRAINING_STORAGE_KEY);
      return raw ? JSON.parse(raw).dayKey || null : null;
    } catch {
      return null;
    }
  });
  const [trainingCompleted, setTrainingCompleted] = useState(() => {
    try {
      const raw = localStorage.getItem(TRAINING_STORAGE_KEY);
      return raw ? new Set(JSON.parse(raw).completed || []) : new Set();
    } catch {
      return new Set();
    }
  });

  const [savedRoutinesMap, setSavedRoutinesMap] = useState({});
  const [openSavedId, setOpenSavedId] = useState(null);
  const [showWeekSummary, setShowWeekSummary] = useState(false);
  const [renamingSavedId, setRenamingSavedId] = useState(null);
  const [renameSavedValue, setRenameSavedValue] = useState("");
  const [savingCurrent, setSavingCurrent] = useState(false);
  const [saveNameValue, setSaveNameValue] = useState("");
  const [importCode, setImportCode] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [shareCode, setShareCode] = useState(null);
  const [sharing, setSharing] = useState(false);

  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [registerForm, setRegisterForm] = useState({ email: "", username: "", password: "", confirm: "" });
  const [recoverForm, setRecoverForm] = useState({ username: "" });
  const [exerciseForm, setExerciseForm] = useState({ nombre: "", categoria: "pecho", orden: "", series: "", repeticiones: "" });
  const [customExerciseMode, setCustomExerciseMode] = useState(false);
  const [recordForm, setRecordForm] = useState({ fecha: todayISO(), peso: "", series: "", repeticiones: "" });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        const profileSnap = await getDoc(doc(db, "users", fbUser.uid));
        const profile = profileSnap.exists() ? profileSnap.data() : { username: fbUser.email };
        const user = { uid: fbUser.uid, email: fbUser.email, username: profile.username, accentColor: profile.accentColor || "coral", displayName: profile.displayName || profile.username };
        setCurrentUser(user);
        await loadRutina(user);
        setScreen((s) => (s === "login" || s === "register" ? "home" : s));
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (restRunning) {
      restIntervalRef.current = setInterval(() => {
        setRestSecondsLeft((s) => {
          if (s <= 1) {
            clearInterval(restIntervalRef.current);
            setRestRunning(false);
            if (navigator.vibrate) navigator.vibrate(200);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => clearInterval(restIntervalRef.current);
  }, [restRunning]);

  function openRestTimer() {
    setRestSecondsLeft(REST_PRESETS[restPresetIndex]);
    setRestRunning(true);
    setRestTimerOpen(true);
  }
  function pickRestPreset(i) {
    setRestPresetIndex(i);
    setRestSecondsLeft(REST_PRESETS[i]);
    setRestRunning(restTimerOpen); // si ya está abierto, sigue corriendo con el nuevo preset
  }
  function resetRestTimer() {
    setRestSecondsLeft(REST_PRESETS[restPresetIndex]);
    setRestRunning(false);
  }
  function openCalc1RM() {
    setCalcWeight("");
    setCalcReps("");
    setCalc1rmOpen(true);
  }

  function flashSuccess(message, next) {
    setSuccess(message);
    setTimeout(() => {
      setSuccess(null);
      if (next) next();
    }, 1000);
  }

  async function loadRutina(user) {
    const [rutinaSnap, exercisesSnap, routinesSnap, savedRoutinesSnap] = await Promise.all([
      getDocs(collection(db, "users", user.uid, "rutina")),
      getDocs(collection(db, "users", user.uid, "exercises")),
      getDocs(collection(db, "users", user.uid, "customRoutines")),
      getDocs(collection(db, "users", user.uid, "savedRoutines")),
    ]);
    const data = {};
    rutinaSnap.docs.forEach((d) => {
      data[d.id] = d.data();
    });
    setRutina(data);
    const exData = {};
    exercisesSnap.docs.forEach((d) => {
      exData[d.id] = d.data();
    });
    setExercisesMap(exData);
    const routinesData = {};
    routinesSnap.docs.forEach((d) => {
      routinesData[d.id] = d.data();
    });
    setCustomRoutinesMap(routinesData);
    const savedData = {};
    savedRoutinesSnap.docs.forEach((d) => {
      savedData[d.id] = d.data();
    });
    setSavedRoutinesMap(savedData);
  }

  // ---------- auth ----------
  async function handleLogin() {
    setError("");
    const { username, password } = loginForm;
    if (!username || !password) return setError("Ingresa usuario y contraseña.");
    try {
      const usernameLower = username.trim().toLowerCase();
      const nameSnap = await getDoc(doc(db, "usernames", usernameLower));
      if (!nameSnap.exists()) return setError("Ese usuario no existe.");
      const { email } = nameSnap.data();
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      setError("Usuario o contraseña incorrectos.");
    }
  }

  async function handleRegister() {
    setError("");
    const { email, username, password, confirm } = registerForm;
    if (!email || !username || !password) return setError("Completa todos los campos.");
    if (password !== confirm) return setError("Las contraseñas no coinciden.");
    const usernameLower = username.trim().toLowerCase();
    try {
      const nameSnap = await getDoc(doc(db, "usernames", usernameLower));
      if (nameSnap.exists()) return setError("Ese usuario ya existe, elige otro.");
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, "users", cred.user.uid), { username, email });
      await setDoc(doc(db, "usernames", usernameLower), { uid: cred.user.uid, email });
      const user = { uid: cred.user.uid, email, username };
      flashSuccess("Cuenta creada", async () => {
        setCurrentUser(user);
        await loadRutina(user);
        setScreen("home");
      });
    } catch (e) {
      if (e.code === "auth/email-already-in-use") setError("Ese correo ya está registrado.");
      else if (e.code === "auth/weak-password") setError("La contraseña debe tener al menos 6 caracteres.");
      else setError("No se pudo crear la cuenta.");
    }
  }

  async function handleRecover() {
    setError("");
    const { username } = recoverForm;
    if (!username) return setError("Ingresa tu usuario.");
    try {
      const usernameLower = username.trim().toLowerCase();
      const nameSnap = await getDoc(doc(db, "usernames", usernameLower));
      if (!nameSnap.exists()) return setError("Ese usuario no existe.");
      const { email } = nameSnap.data();
      await sendPasswordResetEmail(auth, email);
      flashSuccess("Enlace enviado a tu correo", () => {
        setRecoverForm({ username: "" });
        setScreen("login");
      });
    } catch (e) {
      setError("No se pudo enviar el enlace.");
    }
  }

  async function logout() {
    await signOut(auth);
    setCurrentUser(null);
    setRutina({});
    setExercisesMap({});
    setCustomRoutinesMap({});
    setSavedRoutinesMap({});
    setLoginForm({ username: "", password: "" });
    setTrainingDayKey(null);
    setTrainingCompleted(new Set());
    persistTraining(null, new Set());
    setScreen("login");
  }

  // ---------- rutina helpers ----------
  function getDay(dayKey) {
    return rutina[dayKey] || { category: null, plan: [] };
  }

  async function saveDay(dayKey, dayData) {
    await setDoc(doc(db, "users", currentUser.uid, "rutina", dayKey), dayData);
    setRutina((prev) => ({ ...prev, [dayKey]: dayData }));
    return dayData;
  }

  async function saveExercise(exerciseId, exData) {
    await setDoc(doc(db, "users", currentUser.uid, "exercises", exerciseId), exData);
    setExercisesMap((prev) => ({ ...prev, [exerciseId]: exData }));
    return exData;
  }

  async function updateAccentColor(key) {
    setCurrentUser((prev) => ({ ...prev, accentColor: key }));
    try {
      localStorage.setItem(ACCENT_STORAGE_KEY, key);
    } catch (e) {
      // localStorage no disponible (modo privado, etc.) — no es crítico.
    }
    await setDoc(doc(db, "users", currentUser.uid), { accentColor: key }, { merge: true });
  }

  async function updateDisplayName(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCurrentUser((prev) => ({ ...prev, displayName: trimmed }));
    await setDoc(doc(db, "users", currentUser.uid), { displayName: trimmed }, { merge: true });
  }

  async function saveCustomRoutine(id, data) {
    await setDoc(doc(db, "users", currentUser.uid, "customRoutines", id), data);
    setCustomRoutinesMap((prev) => ({ ...prev, [id]: data }));
    return data;
  }

  // ---------- rutinas guardadas: compartir / importar ----------
  function buildRoutineSnapshot() {
    const days = {};
    DAYS.forEach((d) => {
      const day = getDay(d.key);
      days[d.key] = {
        category: day.category || null,
        customLabel: day.category === "personalizada" ? dayRoutineLabel(day) : null,
        plan: (day.plan || []).map((p) => {
          const ex = exercisesMap[p.exerciseId] || {};
          return { exerciseId: p.exerciseId, order: p.order, sets: p.sets, reps: p.reps, name: ex.name || "", custom: !!ex.custom };
        }),
      };
    });
    return days;
  }

  async function saveCurrentAsRoutine(name) {
    const id = "sr-" + uid();
    const data = { name: name.trim() || "Mi rutina", source: "propio", days: buildRoutineSnapshot(), createdAt: Date.now() };
    await setDoc(doc(db, "users", currentUser.uid, "savedRoutines", id), data);
    setSavedRoutinesMap((prev) => ({ ...prev, [id]: data }));
    return id;
  }

  async function renameSavedRoutine(id, newName) {
    const existing = savedRoutinesMap[id];
    if (!existing) return;
    const updated = { ...existing, name: newName.trim() || existing.name };
    await setDoc(doc(db, "users", currentUser.uid, "savedRoutines", id), updated);
    setSavedRoutinesMap((prev) => ({ ...prev, [id]: updated }));
  }

  async function updateSavedRoutine(id) {
    const existing = savedRoutinesMap[id];
    if (!existing) return;
    const updated = { ...existing, days: buildRoutineSnapshot() };
    await setDoc(doc(db, "users", currentUser.uid, "savedRoutines", id), updated);
    setSavedRoutinesMap((prev) => ({ ...prev, [id]: updated }));
    flashSuccess("Rutina actualizada");
  }

  async function deleteSavedRoutine(id) {
    await deleteDoc(doc(db, "users", currentUser.uid, "savedRoutines", id));
    setSavedRoutinesMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (openSavedId === id) setOpenSavedId(null);
  }

  async function activateSavedRoutine(id) {
    const routine = savedRoutinesMap[id];
    if (!routine) return;
    const remappedDays = {};
    for (const d of DAYS) {
      const snap = routine.days[d.key] || { category: null, customLabel: null, plan: [] };
      const newPlan = [];
      const newPlanWithMeta = [];
      for (const item of snap.plan) {
        let exerciseId = item.exerciseId;
        if (!exercisesMap[exerciseId]) {
          if (item.custom) exerciseId = "cx-" + uid();
          await saveExercise(exerciseId, { name: item.name, custom: !!item.custom, records: [] });
        }
        newPlan.push({ exerciseId, order: item.order, sets: item.sets, reps: item.reps });
        newPlanWithMeta.push({ exerciseId, order: item.order, sets: item.sets, reps: item.reps, name: item.name, custom: item.custom });
      }
      const dayData = { category: snap.category, plan: newPlan };
      if (snap.category === "personalizada") dayData.customLabel = snap.customLabel;
      await saveDay(d.key, dayData);
      remappedDays[d.key] = { category: snap.category, customLabel: snap.customLabel, plan: newPlanWithMeta };
    }
    if (routine.source === "importado") {
      const updated = { ...routine, days: remappedDays };
      await setDoc(doc(db, "users", currentUser.uid, "savedRoutines", id), updated);
      setSavedRoutinesMap((prev) => ({ ...prev, [id]: updated }));
    }
    setOpenSavedId(null);
    flashSuccess("Rutina activada");
    setScreen("days");
  }

  async function shareCurrentRoutine() {
    setSharing(true);
    try {
      const code = generateShareCode();
      const data = { ownerUid: currentUser.uid, ownerName: currentUser.username, days: buildRoutineSnapshot(), createdAt: Date.now() };
      await setDoc(doc(db, "sharedRoutines", code), data);
      setShareCode(code);
    } catch (e) {
      setImportMsg("error:No se pudo generar el código.");
    } finally {
      setSharing(false);
    }
  }

  async function importRoutineByCode() {
    setImportMsg("");
    const code = importCode.trim().toUpperCase();
    if (!code) {
      setImportMsg("error:Escribe un código.");
      return;
    }
    try {
      const snap = await getDoc(doc(db, "sharedRoutines", code));
      if (!snap.exists()) {
        setImportMsg("error:Ese código no existe.");
        return;
      }
      const shared = snap.data();
      const id = "sr-" + uid();
      const data = { name: `Rutina de ${shared.ownerName || "un amigo"}`, source: "importado", days: shared.days, createdAt: Date.now() };
      await setDoc(doc(db, "users", currentUser.uid, "savedRoutines", id), data);
      setSavedRoutinesMap((prev) => ({ ...prev, [id]: data }));
      setImportCode("");
      setImportMsg("ok:¡Rutina importada! Ábrela y dale Activar.");
    } catch (e) {
      setImportMsg("error:No se pudo importar.");
    }
  }

  function combinedDayExercises(dayKey) {
    const day = getDay(dayKey);
    return [...(day.plan || [])]
      .map((p) => {
        const ex = exercisesMap[p.exerciseId] || { name: "(eliminado)", custom: false, records: [] };
        return { exerciseId: p.exerciseId, order: p.order, sets: p.sets, reps: p.reps, name: ex.name, custom: ex.custom, records: ex.records || [] };
      })
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  function openDay(dayKey) {
    setCurrentDayKey(dayKey);
    const day = getDay(dayKey);
    setScreen(day.category ? "dayDetail" : "chooseCategory");
  }

  async function chooseCategory(catKey) {
    setError("");
    try {
      const day = getDay(currentDayKey);
      const updated = { ...day, category: catKey };
      delete updated.customRoutineId;

      await saveDay(currentDayKey, updated);

      if (changingCategory) {
        setChangingCategory(false);
        setScreen("dayDetail");
      } else {
        setScreen("addExercise");
      }
    } catch (e) {
      console.error("Error al cambiar de rutina:", e);
      setError(`No se pudo cambiar la rutina: ${e?.message || "error desconocido"}`);
    }
  }

  async function selectCustomRoutine(routineId) {
    const day = getDay(currentDayKey);
    const updated = { ...day, category: "personalizada", customRoutineId: routineId };
    await saveDay(currentDayKey, updated);
    if (changingCategory) {
      setChangingCategory(false);
      setScreen("dayDetail");
    } else {
      setScreen("addExercise");
    }
  }

  function openPersonalizadaName() {
    setRenamingRoutineId(null);
    setCustomLabelInput("");
    setError("");
    setScreen("personalizadaName");
  }

  function openRenameRoutine(id, currentName) {
    setRenamingRoutineId(id);
    setCustomLabelInput(currentName);
    setError("");
    setScreen("personalizadaName");
  }

  async function confirmPersonalizada() {
    if (!customLabelInput.trim()) return setError("Ponle un nombre a tu rutina.");
    if (renamingRoutineId) {
      const existing = customRoutinesMap[renamingRoutineId] || { name: customLabelInput.trim(), hidden: false };
      await saveCustomRoutine(renamingRoutineId, { ...existing, name: customLabelInput.trim() });
      setRenamingRoutineId(null);
      setError("");
      setScreen("chooseCategory");
      return;
    }
    const routineId = "cr-" + uid();
    await saveCustomRoutine(routineId, { name: customLabelInput.trim(), hidden: false });
    setError("");
    await selectCustomRoutine(routineId);
  }

  async function hideCustomRoutine(id, name) {
    if (!window.confirm(`¿Ocultar "${name}" de la lista? Los días que ya la usan la seguirán mostrando.`)) return;
    const existing = customRoutinesMap[id] || { name, hidden: false };
    await saveCustomRoutine(id, { ...existing, hidden: true });
  }

  function dayRoutineLabel(day) {
    if (day.category === "personalizada") {
      return customRoutinesMap[day.customRoutineId]?.name || day.customLabel || "Personalizada";
    }
    return categoryLabel(day.category);
  }

  function openAddExercise() {
    setError("");
    setScreen("addExercise");
  }

  function openExerciseForm(name, exerciseId) {
    const day = getDay(currentDayKey);
    setPendingExerciseName(name);
    setPendingExerciseId(exerciseId);
    setExerciseForm({ nombre: name, categoria: "pecho", orden: String((day.plan || []).length + 1), series: "", repeticiones: "" });
    setEditExercise(false);
    setCustomExerciseMode(false);
    setError("");
    setScreen("exerciseForm");
  }

  function openCustomExerciseForm() {
    const day = getDay(currentDayKey);
    setPendingExerciseName(null);
    setPendingExerciseId(null);
    setExerciseForm({ nombre: "", categoria: "pecho", orden: String((day.plan || []).length + 1), series: "", repeticiones: "" });
    setEditExercise(false);
    setCustomExerciseMode(true);
    setError("");
    setScreen("exerciseForm");
  }

  function openEditExercisePlan(ex) {
    setCurrentExercise(ex);
    setPendingExerciseName(ex.name);
    setPendingExerciseId(ex.exerciseId);
    setExerciseForm({ nombre: ex.name, categoria: ex.category || "pecho", orden: String(ex.order || ""), series: String(ex.sets || ""), repeticiones: String(ex.reps || "") });
    setEditExercise(true);
    setCustomExerciseMode(!!ex.custom);
    setError("");
    setScreen("exerciseForm");
  }

  async function handleSaveExercisePlan() {
    setError("");
    const { nombre, categoria, orden, series, repeticiones } = exerciseForm;
    if (customExerciseMode && !nombre.trim()) return setError("Escribe el nombre del ejercicio.");
    if (!orden || !series || !repeticiones) return setError("Completa orden, series y repeticiones.");
    const day = getDay(currentDayKey);
    const name = customExerciseMode ? nombre.trim() : pendingExerciseName;

    let exerciseId;
    if (editExercise && currentExercise) {
      exerciseId = currentExercise.exerciseId;
      if (customExerciseMode) {
        const existing = exercisesMap[exerciseId] || { name, custom: true, records: [] };
        await saveExercise(exerciseId, { ...existing, name, category: categoria });
      }
    } else if (pendingExerciseId) {
      exerciseId = pendingExerciseId;
      if (!exercisesMap[exerciseId]) {
        const exerciseData = {
          name,
          custom: customExerciseMode,
          records: []
        };
        if (customExerciseMode) exerciseData.category = categoria;
        await saveExercise(exerciseId, exerciseData);
      }
    } else {
      exerciseId = "cx-" + uid();
      await saveExercise(exerciseId, { name, custom: true, category: categoria, records: [] });
    }

    let updatedPlan;
    if (editExercise && currentExercise) {
      updatedPlan = (day.plan || []).map((p) => (p.exerciseId === exerciseId ? { ...p, order: Number(orden), sets: Number(series), reps: Number(repeticiones) } : p));
    } else {
      updatedPlan = [...(day.plan || []), { exerciseId, order: Number(orden), sets: Number(series), reps: Number(repeticiones) }];
    }
    await saveDay(currentDayKey, { ...day, plan: updatedPlan });

    if (editExercise) {
      setCurrentExercise({ ...currentExercise, name, order: Number(orden), sets: Number(series), reps: Number(repeticiones) });
    }
    flashSuccess("Plan guardado", () => {
      setEditExercise(false);
      setScreen(editExercise ? "exerciseDetail" : "dayDetail");
    });
  }

  async function handleDeleteExercisePlan() {
    if (!window.confirm(`¿Quitar ${currentExercise.name} del plan de este día? Tu historial de PR se conserva.`)) return;
    const day = getDay(currentDayKey);
    const updatedPlan = (day.plan || []).filter((p) => p.exerciseId !== currentExercise.exerciseId);
    await saveDay(currentDayKey, { ...day, plan: updatedPlan });
    setCurrentExercise(null);
    setScreen("dayDetail");
  }

  async function quickDeleteExercise(ex) {
    if (!window.confirm(`¿Quitar ${ex.name} del plan de este día? Tu historial de PR se conserva.`)) return;
    const day = getDay(currentDayKey);
    const updatedPlan = (day.plan || []).filter((p) => p.exerciseId !== ex.exerciseId);
    await saveDay(currentDayKey, { ...day, plan: updatedPlan });
  }

  async function deleteCustomExercise(exerciseId, name) {
    if (!window.confirm(`¿Eliminar "${name}" de tus ejercicios personalizados? Se borrará su historial de PR. Si está en algún día, aparecerá como "(eliminado)".`)) return;
    await deleteDoc(doc(db, "users", currentUser.uid, "exercises", exerciseId));
    setExercisesMap((prev) => {
      const next = { ...prev };
      delete next[exerciseId];
      return next;
    });
  }

  function persistTraining(dayKey, completedSet) {
    try {
      if (!dayKey) localStorage.removeItem(TRAINING_STORAGE_KEY);
      else localStorage.setItem(TRAINING_STORAGE_KEY, JSON.stringify({ dayKey, completed: [...completedSet] }));
    } catch {
      // localStorage no disponible — no es crítico.
    }
  }

  function toggleTraining() {
    const nextDayKey = trainingDayKey === currentDayKey ? null : currentDayKey;
    setTrainingDayKey(nextDayKey);
    setTrainingCompleted(new Set());
    persistTraining(nextDayKey, new Set());
  }

  function toggleExerciseDone(exerciseId) {
    setTrainingCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(exerciseId)) next.delete(exerciseId);
      else next.add(exerciseId);
      persistTraining(trainingDayKey, next);
      return next;
    });
  }

  function openExercise(ex) {
    setCurrentExercise(ex);
    setScreen("exerciseDetail");
  }

  function openNewRecord() {
    const last = sortByFecha(currentExercise.records || [])[0];
    setRecordForm({
      fecha: todayISO(),
      peso: last ? String(last.peso) : "",
      series: String(currentExercise.sets || (last ? last.series : "") || ""),
      repeticiones: String(currentExercise.reps || (last ? last.repeticiones : "") || ""),
    });
    setEditRecordId(null);
    setError("");
    setScreen("addRecord");
  }

  function openEditRecord(r) {
    setRecordForm({ fecha: r.fecha, peso: String(r.peso), series: String(r.series || ""), repeticiones: String(r.repeticiones || "") });
    setEditRecordId(r.id);
    setError("");
    setScreen("addRecord");
  }

  async function handleSaveRecord() {
    setError("");
    const { fecha, peso, series, repeticiones } = recordForm;

    if (!fecha || !peso) return setError("Ingresa la fecha y el peso.");
    if (!series || !repeticiones) return setError("Completa series y repeticiones.");

    try {
      const exerciseId = currentExercise.exerciseId;
      const exData = exercisesMap[exerciseId] || {
        name: currentExercise.name,
        custom: !!currentExercise.custom,
        records: []
      };

      const currentRecords = exData.records || [];
      const previousPR = currentRecords.length ? Math.max(...currentRecords.map((r) => Number(r.peso) || 0)) : null;
      const newWeight = Number(peso);
      let updatedRecords;

      if (editRecordId) {
        updatedRecords = currentRecords.map((r) =>
          r.id === editRecordId
            ? {
                ...r,
                fecha,
                peso: Number(peso),
                series: Number(series),
                repeticiones: Number(repeticiones)
              }
            : r
        );
      } else {
        updatedRecords = [
          {
            id: uid(),
            fecha,
            peso: Number(peso),
            series: Number(series),
            repeticiones: Number(repeticiones)
          },
          ...currentRecords
        ];
      }

      await saveExercise(exerciseId, {
        ...exData,
        records: updatedRecords
      });

      setCurrentExercise({
        ...currentExercise,
        records: updatedRecords
      });

      const isNewPR = !editRecordId && previousPR !== null && newWeight > previousPR;

      if (isNewPR) {
        setRecordCelebration({
          exerciseName: currentExercise.name,
          before: previousPR,
          after: newWeight
        });
        setTimeout(() => {
          setRecordCelebration(null);
          setEditRecordId(null);
          setScreen("exerciseDetail");
        }, 2200);
      } else {
        flashSuccess("Registro guardado", () => {
          setEditRecordId(null);
          setScreen("exerciseDetail");
        });
      }
    } catch (e) {
      console.error("Error al guardar registro:", e);
      setError(`No se pudo guardar el registro: ${e?.message || "error desconocido"}`);
    }
  }

  async function handleDeleteRecord() {
    if (!window.confirm("¿Eliminar este registro?")) return;
    const exerciseId = currentExercise.exerciseId;
    const exData = exercisesMap[exerciseId] || { name: currentExercise.name, custom: currentExercise.custom, records: [] };
    const updatedRecords = (exData.records || []).filter((r) => r.id !== editRecordId);
    await saveExercise(exerciseId, { ...exData, records: updatedRecords });
    setCurrentExercise({ ...currentExercise, records: updatedRecords });
    setEditRecordId(null);
    setScreen("exerciseDetail");
  }

  // ---------- color activo ----------
  let savedAccentKey = "coral";
  try {
    savedAccentKey = localStorage.getItem(ACCENT_STORAGE_KEY) || "coral";
  } catch (e) {
    // localStorage no disponible — usamos el valor por defecto.
  }
  const accentKey = currentUser?.accentColor || savedAccentKey;
  const accent = ACCENTS[accentKey] || ACCENTS.coral;
  CURRENT_ACCENT = accent;

  // ---------- shared shell ----------
  const shell = {
    minHeight: "100vh",
    width: "100%",
    background: "#141311",
    color: "#f2ede6",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    boxSizing: "border-box",
    padding: "28px 20px 40px",
    position: "relative",
    maxWidth: 480,
    margin: "0 auto",
  };

  if (loading) return <div style={shell} />;

  // ---------- LOGIN ----------
  if (screen === "login") {
    return (
      <div style={shell}>
        <div
          style={{
            position: "relative",
            borderRadius: 28,
            padding: "34px 26px",
            marginBottom: 30,
            marginTop: 20,
            background: `linear-gradient(145deg, ${accent.from} 0%, ${accent.to} 100%)`,
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", top: -50, right: -30, width: 160, height: 160, borderRadius: "50%", background: "rgba(255,255,255,0.10)" }} />
          <div style={{ position: "absolute", bottom: -60, left: -30, width: 130, height: 130, borderRadius: "50%", background: "rgba(255,255,255,0.07)" }} />
          <div style={{ position: "relative" }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
              <Dumbbell size={22} color={accent.text} />
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: accent.text }}>MiRutina</div>
            <div style={{ fontSize: 13.5, color: accent.text, opacity: 0.7, marginTop: 4 }}>Inicia sesión para continuar</div>
          </div>
        </div>
        <label style={{ display: "block", marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, color: "#a39d95", marginBottom: 6, fontWeight: 500, letterSpacing: 0.2 }}>Usuario</div>
          <input
            value={loginForm.username}
            onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
            placeholder="tu_usuario"
            style={{ width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 14, border: "1px solid #2f2c28", background: "#1a1917", color: "#f2ede6", fontSize: 15.5, outline: "none" }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 22, position: "relative" }}>
          <div style={{ fontSize: 12.5, color: "#a39d95", marginBottom: 6, fontWeight: 500, letterSpacing: 0.2 }}>Contraseña</div>
          <input
            type={showPw ? "text" : "password"}
            value={loginForm.password}
            onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
            placeholder="••••••••"
            style={{ width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 14, border: "1px solid #2f2c28", background: "#1a1917", color: "#f2ede6", fontSize: 15.5, outline: "none" }}
          />
          <button onClick={() => setShowPw(!showPw)} style={{ position: "absolute", right: 14, top: 32, background: "none", border: "none", color: "#8a8580", cursor: "pointer" }}>
            {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </label>
        {error && <div style={{ color: "#e0725e", fontSize: 13.5, marginBottom: 12 }}>{error}</div>}
        <button
          onClick={handleLogin}
          style={{ width: "100%", padding: "15px 18px", borderRadius: 16, border: "none", background: accent.solid, color: accent.text, fontSize: 16, fontWeight: 700, cursor: "pointer" }}
        >
          Iniciar sesión
        </button>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22, fontSize: 13.5 }}>
          <button onClick={() => { setError(""); setScreen("register"); }} style={{ background: "none", border: "none", color: accent.solid, cursor: "pointer", padding: 0, fontWeight: 600 }}>
            Crear cuenta nueva
          </button>
          <button onClick={() => { setError(""); setScreen("recover"); }} style={{ background: "none", border: "none", color: "#8a8580", cursor: "pointer", padding: 0 }}>
            Recuperar contraseña
          </button>
        </div>
      </div>
    );
  }

  // ---------- REGISTER ----------
  if (screen === "register") {
    return (
      <div style={shell}>
        {success && <SuccessOverlay message={success} />}
        <TopBar title="Nueva cuenta" onBack={() => setScreen("login")} />
        <Field label="Usuario" value={registerForm.username} onChange={(e) => setRegisterForm({ ...registerForm, username: e.target.value })} placeholder="Elige un nombre" />
        <Field label="Correo electrónico" type="email" value={registerForm.email} onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })} placeholder="tu@correo.com" />
        <div style={{ fontSize: 12, color: "#8a8580", marginTop: -8, marginBottom: 16 }}>Solo se usa para recuperar tu contraseña.</div>
        <Field label="Contraseña" type="password" value={registerForm.password} onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })} placeholder="••••••••" />
        <Field label="Confirmar contraseña" type="password" value={registerForm.confirm} onChange={(e) => setRegisterForm({ ...registerForm, confirm: e.target.value })} placeholder="••••••••" />
        {error && <div style={{ color: "#e0725e", fontSize: 13.5, marginBottom: 12 }}>{error}</div>}
        <PrimaryButton onClick={handleRegister}>Crear cuenta</PrimaryButton>
      </div>
    );
  }

  // ---------- RECOVER ----------
  if (screen === "recover") {
    return (
      <div style={shell}>
        {success && <SuccessOverlay message={success} />}
        <TopBar title="Recuperar contraseña" onBack={() => setScreen("login")} />
        <Field label="Usuario" value={recoverForm.username} onChange={(e) => setRecoverForm({ username: e.target.value })} placeholder="tu_usuario" />
        {error && <div style={{ color: "#e0725e", fontSize: 13.5, marginBottom: 12 }}>{error}</div>}
        <PrimaryButton onClick={handleRecover}>Enviar enlace de recuperación</PrimaryButton>
      </div>
    );
  }

  // ---------- HOME ----------
  if (screen === "home") {
    return (
      <div style={shell}>
        {success && <SuccessOverlay message={success} />}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, position: "relative" }}>
          <button
            onClick={() => {
              setAccentPickerOpen((v) => {
                const next = !v;
                if (next) setDisplayNameValue(currentUser?.displayName || currentUser?.username || "");
                return next;
              });
            }}
            aria-label="Cambiar color de la app"
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              border: "1px solid #2f2c28",
              background: "#1f1e1c",
              color: accent.solid,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            <Pencil size={13} />
          </button>
          <button onClick={logout} style={{ background: "none", border: "none", color: "#6e6a65", fontSize: 13, cursor: "pointer" }}>
            Salir
          </button>

          {accentPickerOpen && (
            <div
              style={{
                position: "absolute",
                top: 36,
                left: 0,
                background: "#1f1e1c",
                border: "1px solid #2f2c28",
                borderRadius: 16,
                padding: 10,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                width: 190,
                zIndex: 10,
                boxShadow: "0 8px 20px rgba(0,0,0,0.35)",
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: "#8a8580", marginBottom: 4 }}>Nombre para mostrar</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    value={displayNameValue}
                    onChange={(e) => setDisplayNameValue(e.target.value)}
                    maxLength={24}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      background: "#141311",
                      border: "1px solid #33312e",
                      borderRadius: 10,
                      color: "#f2ede6",
                      fontSize: 13,
                      padding: "6px 8px",
                    }}
                  />
                  <button
                    onClick={() => {
                      updateDisplayName(displayNameValue);
                      setAccentPickerOpen(false);
                    }}
                    style={{ flexShrink: 0, border: "none", borderRadius: 10, background: accent.solid, color: accent.text, fontSize: 12, fontWeight: 600, padding: "0 10px", cursor: "pointer" }}
                  >
                    Guardar
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {Object.entries(ACCENTS).map(([key, opt]) => (
                <button
                  key={key}
                  onClick={() => {
                    updateAccentColor(key);
                    setAccentPickerOpen(false);
                  }}
                  aria-label={opt.name}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    border: accentKey === key ? "2px solid #f2ede6" : "2px solid transparent",
                    padding: 2,
                    background: "transparent",
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      width: "100%",
                      height: "100%",
                      borderRadius: "50%",
                      background: `linear-gradient(145deg, ${opt.from} 0%, ${opt.to} 100%)`,
                    }}
                  />
                </button>
              ))}
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            position: "relative",
            borderRadius: 28,
            padding: "30px 26px",
            marginBottom: 22,
            background: `linear-gradient(145deg, ${accent.from} 0%, ${accent.to} 100%)`,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -50,
              right: -30,
              width: 160,
              height: 160,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.10)",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: -60,
              left: -30,
              width: 130,
              height: 130,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.07)",
            }}
          />
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.18)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Dumbbell size={18} color={accent.text} />
              </div>
              <div style={{ fontSize: 13.5, color: accent.text, opacity: 0.75, fontWeight: 600 }}>Hola</div>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: accent.text, lineHeight: 1.1 }}>{currentUser?.displayName || currentUser?.username || ""}</div>
            <div style={{ fontSize: 13.5, color: accent.text, opacity: 0.65, marginTop: 4 }}>MiRutina App</div>
          </div>
        </div>

        <button
          onClick={() => setScreen("days")}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "18px 20px",
            borderRadius: 20,
            border: "1px solid #2c2924",
            background: "#1f1e1c",
            color: "#f2ede6",
            cursor: "pointer",
          }}
        >
          <span style={{ flex: 1, textAlign: "left", fontSize: 16.5, fontWeight: 600 }}>Mi rutina</span>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: accent.solid,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <ChevronRight size={17} color={accent.text} strokeWidth={2.5} />
          </div>
        </button>

        <button
          onClick={() => setUpdatesOpen((v) => !v)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "10px 0 4px",
            marginTop: 10,
            background: "none",
            border: "none",
            color: "#8a8580",
            fontSize: 12.5,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          <Sparkles size={13} color={accent.solid} />
          Ver últimas actualizaciones
          {updatesOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {updatesOpen && (
          <div style={{ marginTop: 8, border: "1px solid #2a2824", borderRadius: 16, overflow: "hidden" }}>
            {UPDATES.slice(0, 5).map((u, i) => (
              <div key={i} style={{ padding: "12px 14px", borderTop: i === 0 ? "none" : "1px solid #232019", display: "flex", gap: 10 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: accent.solid, marginTop: 6, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 11, color: "#6e6a65", marginBottom: 2 }}>{u.date}</div>
                  <div style={{ fontSize: 13, color: "#d7d2ca", lineHeight: 1.4 }}>{u.text}</div>
                </div>
              </div>
            ))}
            {UPDATES.length > 5 && (
              <button
                onClick={() => setAllUpdatesOpen(true)}
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  border: "none",
                  borderTop: "1px solid #232019",
                  background: "none",
                  color: accent.solid,
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Ver todas ({UPDATES.length})
              </button>
            )}
          </div>
        )}

        {allUpdatesOpen && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(15,14,13,0.96)",
              zIndex: 50,
              display: "flex",
              flexDirection: "column",
              padding: "28px 20px 40px",
              boxSizing: "border-box",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexShrink: 0 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>Todas las actualizaciones</span>
              <button onClick={() => setAllUpdatesOpen(false)} style={{ background: "none", border: "none", color: "#8a8580", cursor: "pointer" }}>
                <X size={22} />
              </button>
            </div>
            <div style={{ overflowY: "auto", border: "1px solid #2a2824", borderRadius: 16 }}>
              {UPDATES.map((u, i) => (
                <div key={i} style={{ padding: "12px 14px", borderTop: i === 0 ? "none" : "1px solid #232019", display: "flex", gap: 10 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: accent.solid, marginTop: 6, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 11, color: "#6e6a65", marginBottom: 2 }}>{u.date}</div>
                    <div style={{ fontSize: 13, color: "#d7d2ca", lineHeight: 1.4 }}>{u.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------- DAYS LIST ----------
  if (screen === "days") {
    const today = todayDayKey();
    return (
      <div style={shell}>
        <TopBar title="Mi rutina" onBack={() => setScreen("home")} />
        {success && <SuccessOverlay message={success} />}
        {DAYS.map((d) => {
          const day = getDay(d.key);
          const isToday = d.key === today;
          return (
            <div key={d.key} style={{ marginBottom: 8 }}>
              <button
                onClick={() => openDay(d.key)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: 18,
                  border: isToday ? `1.5px solid ${accent.solid}` : "1px solid #2f2c28",
                  background: isToday ? "#2a1d15" : "#1a1917",
                  color: "#f2ede6",
                  fontSize: 16,
                  fontWeight: 500,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div>{d.label}</div>
                  <div style={{ fontSize: 12.5, color: day.category ? "#a39d95" : "#6e6a65", marginTop: 2 }}>
                    {day.category ? dayRoutineLabel(day) : "Sin rutina asignada"}
                  </div>
                </span>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    background: isToday ? accent.solid : "#2a2824",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <ChevronRight size={15} color={isToday ? accent.text : "#8a8580"} strokeWidth={2.5} />
                </div>
              </button>
            </div>
          );
        })}

        {(() => {
          const totals = {};
          DAYS.forEach((d) => {
            const day = getDay(d.key);
            if (day.category === "descanso") return;
            (day.plan || []).forEach((p) => {
              const catKey = FIXED_EXERCISE_CATEGORY[p.exerciseId] || exercisesMap[p.exerciseId]?.category || "otro";
              totals[catKey] = (totals[catKey] || 0) + (Number(p.sets) || 0);
            });
          });
          const rows = EXERCISE_CATEGORIES.filter((c) => c.key !== "cardio" && c.key !== "otro" && totals[c.key]).map((c) => ({ key: c.key, label: c.label, total: totals[c.key] }));
          if (rows.length === 0) return null;
          return (
            <div style={{ marginTop: 18 }}>
              <button
                onClick={() => setShowWeekSummary((v) => !v)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  margin: "0 auto",
                  padding: "7px 14px",
                  borderRadius: 999,
                  border: "1px solid #33312e",
                  background: "none",
                  color: "#a39d95",
                  fontSize: 12.5,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {showWeekSummary ? "Ocultar resumen" : "Resumen"}
                <ChevronDown size={13} style={{ transform: showWeekSummary ? "rotate(180deg)" : "none" }} />
              </button>
              {showWeekSummary && (
                <div style={{ marginTop: 10, padding: "14px 16px", borderRadius: 16, border: "1px solid #2a2824", background: "#1a1917" }}>
                  <div style={{ fontSize: 12, color: "#8a8580", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>RESUMEN DE LA SEMANA</div>
                  {rows.map((r) => (
                    <div key={r.key} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "6px 0" }}>
                      <span style={{ color: "#c9c4bd" }}>{r.label}</span>
                      <span style={{ color: "#f2ede6", fontWeight: 600 }}>{r.total} series</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button
            onClick={() => {
              setShareCode(null);
              shareCurrentRoutine();
            }}
            disabled={sharing}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "9px 12px",
              borderRadius: 999,
              border: "1px solid #2f2c28",
              background: "transparent",
              color: "#8a8580",
              fontSize: 12.5,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <Share2 size={13} /> {sharing ? "Generando..." : "Compartir"}
          </button>
          <button
            onClick={() => setScreen("savedRoutines")}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "9px 12px",
              borderRadius: 999,
              border: "1px solid #2f2c28",
              background: "transparent",
              color: "#8a8580",
              fontSize: 12.5,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <FolderClock size={13} /> Rutinas guardadas
          </button>
        </div>

        {shareCode && (
          <div
            style={{
              marginTop: 12,
              padding: "12px 14px",
              borderRadius: 14,
              border: "1px solid #2a2824",
              background: "#1a1917",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div>
              <div style={{ fontSize: 11.5, color: "#8a8580" }}>Tu código para compartir</div>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 2 }}>{shareCode}</div>
            </div>
            <button
              onClick={() => {
                if (navigator.clipboard) navigator.clipboard.writeText(shareCode);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 12px",
                borderRadius: 999,
                border: "none",
                background: accent.solid,
                color: accent.text,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Copy size={13} /> Copiar
            </button>
          </div>
        )}
      </div>
    );
  }

  // ---------- RUTINAS GUARDADAS ----------
  if (screen === "savedRoutines") {
    const savedList = Object.entries(savedRoutinesMap).sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
    const openRoutine = openSavedId ? savedRoutinesMap[openSavedId] : null;
    return (
      <div style={shell}>
        <TopBar title="Rutinas guardadas" onBack={() => setScreen("days")} />
        {success && <SuccessOverlay message={success} />}

        {savedList.length === 0 && (
          <div style={{ color: "#8a8580", fontSize: 14, marginBottom: 16 }}>Aún no tienes rutinas guardadas.</div>
        )}

        {savedList.map(([id, r]) => (
          <div key={id} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <button
                onClick={() => setOpenSavedId(id === openSavedId ? null : id)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 16px",
                  borderRadius: 18,
                  border: "1px solid #33312e",
                  background: "#1f1e1c",
                  color: "#f2ede6",
                  fontSize: 15.5,
                  fontWeight: 500,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.source === "importado" && <Star size={12} color={accent.solid} fill={accent.solid} style={{ flexShrink: 0 }} />}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#8a8580", marginTop: 3 }}>{r.source === "importado" ? "Importada" : "Guardada por ti"}</div>
                </span>
                <ChevronRight size={17} color="#6e6a65" style={{ flexShrink: 0 }} />
              </button>
            </div>
            <button
              onClick={() => deleteSavedRoutine(id)}
              style={{ width: 44, height: 44, flexShrink: 0, border: "none", background: "transparent", color: "#5c5851", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}

        {openRoutine && (
          <div style={{ background: "#1a1917", border: "1px solid #2a2824", borderRadius: 16, padding: "14px 16px", marginBottom: 18 }}>
            {renamingSavedId === openSavedId ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <input
                  autoFocus
                  value={renameSavedValue}
                  onChange={(e) => setRenameSavedValue(e.target.value)}
                  style={{ flex: 1, background: "#141311", border: "1px solid #3a3630", borderRadius: 10, color: "#f2ede6", padding: "10px 12px", fontSize: 14.5 }}
                />
                <button
                  onClick={async () => {
                    await renameSavedRoutine(openSavedId, renameSavedValue);
                    setRenamingSavedId(null);
                  }}
                  style={{ width: 40, height: 40, flexShrink: 0, border: "none", borderRadius: 10, background: "#3fa863", color: "#0f1a12", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                >
                  <Check size={17} />
                </button>
                <button
                  onClick={() => setRenamingSavedId(null)}
                  style={{ width: 40, height: 40, flexShrink: 0, border: "1px solid #35322e", borderRadius: 10, background: "transparent", color: "#a39d95", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                >
                  <X size={17} />
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "#8a8580", fontWeight: 700, letterSpacing: 0.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {openRoutine.name.toUpperCase()}
                  </div>
                  <button
                    onClick={() => {
                      setRenamingSavedId(openSavedId);
                      setRenameSavedValue(openRoutine.name);
                    }}
                    style={{ width: 32, height: 32, flexShrink: 0, border: "1px solid #35322e", borderRadius: 9, background: "transparent", color: "#c9c4bd", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                  >
                    <Pencil size={14} />
                  </button>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  {openRoutine.source !== "importado" && (
                    <button
                      onClick={() => {
                        if (window.confirm(`¿Sobrescribir "${openRoutine.name}" con tu rutina actual? Esto reemplaza lo que tenías guardado ahí.`)) {
                          updateSavedRoutine(openSavedId);
                        }
                      }}
                      style={{ fontSize: 12, fontWeight: 600, color: "#f2ede6", background: "#1f1e1c", border: "1px solid #33312e", borderRadius: 999, padding: "8px 14px", cursor: "pointer" }}
                    >
                      Actualizar
                    </button>
                  )}
                  <button
                    onClick={() => activateSavedRoutine(openSavedId)}
                    style={{ fontSize: 12, fontWeight: 600, color: accent.text, background: accent.solid, border: "none", borderRadius: 999, padding: "8px 14px", cursor: "pointer" }}
                  >
                    Activar
                  </button>
                </div>
              </div>
            )}            {DAYS.map((d) => {
              const snap = openRoutine.days[d.key] || { category: null, customLabel: null };
              const label = snap.category === "personalizada" ? snap.customLabel : categoryLabel(snap.category);
              return (
                <div key={d.key} style={{ fontSize: 12.5, color: "#a39d95", marginBottom: 2 }}>
                  <span style={{ color: "#d7d2ca" }}>{d.label}</span>: {snap.category ? label : "Descanso"}
                </div>
              );
            })}
          </div>
        )}

        {savingCurrent ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 26 }}>
            <input
              autoFocus
              value={saveNameValue}
              onChange={(e) => setSaveNameValue(e.target.value)}
              placeholder="Nombre de la rutina"
              style={{ flex: 1, padding: "12px 14px", borderRadius: 12, border: "1px solid #35322e", background: "#1a1917", color: "#f2ede6", fontSize: 14.5, outline: "none" }}
            />
            <button
              onClick={async () => {
                if (!saveNameValue.trim()) return;
                await saveCurrentAsRoutine(saveNameValue);
                setSaveNameValue("");
                setSavingCurrent(false);
              }}
              style={{ width: 44, height: 44, flexShrink: 0, border: "none", borderRadius: 12, background: "#3fa863", color: "#0f1a12", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              <Check size={18} />
            </button>
            <button
              onClick={() => {
                setSavingCurrent(false);
                setSaveNameValue("");
              }}
              style={{ width: 44, height: 44, flexShrink: 0, border: "1px solid #35322e", borderRadius: 12, background: "transparent", color: "#a39d95", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              <X size={18} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setSavingCurrent(true)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "12px 18px",
              borderRadius: 999,
              border: "1.5px dashed #4a4640",
              background: "transparent",
              color: accent.solid,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              marginBottom: 26,
            }}
          >
            <Save size={16} /> Guardar rutina actual
          </button>
        )}

        <div style={{ paddingTop: 20, borderTop: "1px solid #2a2824" }}>
          <div style={{ fontSize: 13, color: "#a39d95", marginBottom: 10 }}>¿Un amigo te compartió su rutina?</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              value={importCode}
              onChange={(e) => setImportCode(e.target.value)}
              placeholder="Código, ej. FIT7K2"
              style={{ flex: 1, padding: "12px 14px", borderRadius: 12, border: "1px solid #35322e", background: "#1a1917", color: "#f2ede6", fontSize: 14.5, outline: "none" }}
            />
            <button
              onClick={importRoutineByCode}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 16px", borderRadius: 12, border: "none", background: accent.solid, color: accent.text, fontWeight: 600, fontSize: 14, cursor: "pointer" }}
            >
              <Download size={15} /> Agregar
            </button>
          </div>
          {importMsg && <div style={{ fontSize: 12.5, color: importMsg.startsWith("ok") ? "#3fa863" : "#e0725e" }}>{importMsg.split(":")[1]}</div>}
        </div>
      </div>
    );
  }

  // ---------- CHOOSE CATEGORY ----------
  if (screen === "chooseCategory" && currentDayKey) {
    const dayLabel = DAYS.find((d) => d.key === currentDayKey)?.label;
    const visibleRoutines = Object.entries(customRoutinesMap).filter(([id, r]) => !r.hidden);
    return (
      <div style={shell}>
        <TopBar title={dayLabel} onBack={() => { setChangingCategory(false); setScreen(getDay(currentDayKey).category ? "dayDetail" : "days"); }} />
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>¿Qué vas a entrenar?</div>
        {CATEGORIES.map((c) => (
          <PillButton key={c.key} compact onClick={() => chooseCategory(c.key)}>
            {c.label}
          </PillButton>
        ))}
        <div style={{ marginTop: 10, marginBottom: 20 }}>
          <PillButton compact muted onClick={() => chooseCategory("descanso")} subtitle="Día libre, sin ejercicios">
            Descanso
          </PillButton>
        </div>

        <div style={{ fontSize: 12, color: "#8a8580", fontWeight: 700, letterSpacing: 0.4, marginBottom: 8 }}>PERSONALIZADA</div>
        {visibleRoutines.map(([id, r]) => (
          <PillButton
            key={id}
            compact
            onClick={() => selectCustomRoutine(id)}
            onEdit={() => openRenameRoutine(id, r.name)}
            onDelete={() => hideCustomRoutine(id, r.name)}
          >
            {r.name}
          </PillButton>
        ))}
        <DashedButton onClick={openPersonalizadaName}>
          <Plus size={17} /> Nueva rutina personalizada
        </DashedButton>
      </div>
    );
  }

  // ---------- NOMBRE DE RUTINA PERSONALIZADA ----------
  if (screen === "personalizadaName" && currentDayKey) {
    const dayLabel = DAYS.find((d) => d.key === currentDayKey)?.label;
    return (
      <div style={shell}>
        <TopBar title={dayLabel} onBack={() => setScreen("chooseCategory")} />
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>{renamingRoutineId ? "Renombra tu rutina" : "Nombra tu rutina"}</div>
        <Field label="Nombre de la rutina" value={customLabelInput} onChange={(e) => setCustomLabelInput(e.target.value)} placeholder="Ej. Superior" />
        {error && <div style={{ color: "#e0725e", fontSize: 13.5, marginBottom: 12 }}>{error}</div>}
        <PrimaryButton onClick={confirmPersonalizada}>{renamingRoutineId ? "Guardar" : "Continuar"}</PrimaryButton>
      </div>
    );
  }

  // ---------- DAY DETAIL ----------
  if (screen === "dayDetail" && currentDayKey) {
    const dayLabel = DAYS.find((d) => d.key === currentDayKey)?.label;
    const day = getDay(currentDayKey);
    const exercises = combinedDayExercises(currentDayKey);
    const isRestDay = day.category === "descanso";
    const isTraining = trainingDayKey === currentDayKey;
    return (
      <div style={shell}>
        <TopBar title={dayLabel} onBack={() => setScreen("days")} />
        <button
          onClick={() => { setChangingCategory(true); setScreen("chooseCategory"); }}
          style={{ background: "none", border: "none", color: "#6e6a65", fontSize: 12, cursor: "pointer", padding: 0, marginBottom: 20, display: "block" }}
        >
          Rutina: {dayRoutineLabel(day)} · cambiar
        </button>

        {isRestDay ? (
          <div style={{ color: "#a39d95", fontSize: 14.5, textAlign: "center", padding: "30px 0" }}>Día de descanso 🛌</div>
        ) : (
          <>
            {exercises.length === 0 ? (
              <div style={{ color: "#8a8580", fontSize: 14, marginBottom: 16 }}>Aún no has agregado ejercicios.</div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  <button
                    onClick={toggleTraining}
                    style={{
                      padding: "7px 18px",
                      borderRadius: 999,
                      border: "none",
                      background: isTraining ? "#e0725e" : accent.solid,
                      color: isTraining ? "#1a1512" : accent.text,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {isTraining ? "Terminar" : "Empezar"}
                  </button>
                  <button
                    onClick={openRestTimer}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "7px 16px",
                      borderRadius: 999,
                      border: "1px solid #33312e",
                      background: "#1f1e1c",
                      color: "#f2ede6",
                      fontSize: 13.5,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    <Timer size={15} color={accent.solid} /> Descansar
                  </button>
                </div>

                {exercises.map((ex) => {
                  const pr = prOf(ex);
                  return (
                    <PillButton
                      key={ex.exerciseId}
                      starred={ex.custom}
                      onClick={() => openExercise(ex)}
                      onDelete={() => quickDeleteExercise(ex)}
                      onCheck={isTraining ? () => toggleExerciseDone(ex.exerciseId) : undefined}
                      checked={trainingCompleted.has(ex.exerciseId)}
                      subtitle={`${pr !== null ? `PR: ${pr} kg` : "Sin PR"} · ${ex.sets}x${ex.reps} reps`}
                    >
                      {ex.name}
                    </PillButton>
                  );
                })}
              </>
            )}

            <div style={{ marginTop: 6 }}>
              <DashedButton onClick={openAddExercise}>
                <Plus size={17} /> Agregar ejercicio
              </DashedButton>
            </div>
          </>
        )}

        {restTimerOpen && (
          <RestTimerOverlay
            accent={accent}
            presetIndex={restPresetIndex}
            onPickPreset={pickRestPreset}
            secondsLeft={restSecondsLeft}
            running={restRunning}
            onToggleRunning={() => setRestRunning((v) => !v)}
            onReset={resetRestTimer}
            onClose={() => setRestTimerOpen(false)}
          />
        )}
      </div>
    );
  }

  // ---------- ADD EXERCISE (todas las categorías) ----------
  if (screen === "addExercise" && currentDayKey) {
    const day = getDay(currentDayKey);
    const alreadyIds = new Set((day.plan || []).map((p) => p.exerciseId));
    const sections = EXERCISE_CATEGORIES.map((cat) => {
      const fixed = cat.exercises.filter((name) => !alreadyIds.has("fx-" + slugify(name))).map((name) => ({ id: "fx-" + slugify(name), name, custom: false }));
      const customs = Object.entries(exercisesMap)
        .filter(([id, ex]) => ex.custom && !alreadyIds.has(id) && (ex.category === cat.key || (cat.key === "otro" && !ex.category)))
        .map(([id, ex]) => ({ id, name: ex.name, custom: true }));
      return { key: cat.key, label: cat.label, items: [...fixed, ...customs] };
    }).filter((s) => s.items.length > 0);

    return (
      <div style={shell}>
        <TopBar title="Agregar ejercicio" onBack={() => setScreen("dayDetail")} />
        {sections.length === 0 && (
          <div style={{ color: "#8a8580", fontSize: 14, marginBottom: 16 }}>Ya agregaste todos los ejercicios disponibles.</div>
        )}
        {sections.map((s) => (
          <div key={s.key} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: "#8a8580", fontWeight: 700, letterSpacing: 0.4, marginBottom: 8 }}>{s.label.toUpperCase()}</div>
            {s.items.map((it) => (
              <PillButton
                key={it.id}
                compact
                starred={it.custom}
                onClick={() => openExerciseForm(it.name, it.id)}
                onDelete={it.custom ? () => deleteCustomExercise(it.id, it.name) : undefined}
              >
                {it.name}
              </PillButton>
            ))}
          </div>
        ))}

        <DashedButton onClick={openCustomExerciseForm}>
          <Plus size={17} /> Ejercicio personalizado nuevo
        </DashedButton>
      </div>
    );
  }

  // ---------- EXERCISE FORM (orden, series, reps) ----------
  if (screen === "exerciseForm") {
    return (
      <div style={shell}>
        {success && <SuccessOverlay message={success} />}
        <TopBar title={customExerciseMode ? "Ejercicio personalizado" : pendingExerciseName} onBack={() => setScreen(editExercise ? "exerciseDetail" : "addExercise")} />
        {customExerciseMode && (
          <>
            <Field label="Nombre del ejercicio" value={exerciseForm.nombre} onChange={(e) => setExerciseForm({ ...exerciseForm, nombre: e.target.value })} placeholder="Ej. Pecho barra amarilla" />
            <SelectField
              label="Categoría"
              value={exerciseForm.categoria}
              onChange={(e) => setExerciseForm({ ...exerciseForm, categoria: e.target.value })}
              options={EXERCISE_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))}
            />
          </>
        )}
        <Field label="Orden en el día" type="number" min="1" value={exerciseForm.orden} onChange={(e) => setExerciseForm({ ...exerciseForm, orden: e.target.value })} placeholder="Ej. 1" />
        <Field label="Series" type="number" min="1" value={exerciseForm.series} onChange={(e) => setExerciseForm({ ...exerciseForm, series: e.target.value })} placeholder="Ej. 3" />
        <Field label="Repeticiones" type="number" min="1" value={exerciseForm.repeticiones} onChange={(e) => setExerciseForm({ ...exerciseForm, repeticiones: e.target.value })} placeholder="Ej. 10" />
        {error && <div style={{ color: "#e0725e", fontSize: 13.5, marginBottom: 12 }}>{error}</div>}
        <PrimaryButton onClick={handleSaveExercisePlan}>{editExercise ? "Guardar cambios" : "Agregar a mi rutina"}</PrimaryButton>
        {editExercise && (
          <button onClick={handleDeleteExercisePlan} style={{ width: "100%", padding: "12px", marginTop: 10, background: "transparent", border: "none", color: "#e07856", fontSize: 14, cursor: "pointer" }}>
            Quitar del plan de este día
          </button>
        )}
      </div>
    );
  }

  // ---------- EXERCISE DETAIL (PR + records) ----------
  if (screen === "exerciseDetail" && currentExercise) {
    const pr = prOf(currentExercise);
    const records = sortByFecha(currentExercise.records || []);
    return (
      <div style={shell}>
        {success && <SuccessOverlay message={success} />}
        {recordCelebration && <NewRecordOverlay {...recordCelebration} />}
        <TopBar title={currentExercise.name} onBack={() => setScreen("dayDetail")} />

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#2a2320", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Trophy size={19} color={accent.solid} />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{pr !== null ? `${pr} kg` : "Sin registros aún"}</div>
            <div style={{ fontSize: 12, color: "#8a8580" }}>Récord personal (PR)</div>
          </div>
        </div>

        <button onClick={() => openEditExercisePlan(currentExercise)} style={{ background: "none", border: "none", color: "#a39d95", fontSize: 12.5, cursor: "pointer", padding: 0, marginBottom: 20 }}>
          Plan: {currentExercise.sets}x{currentExercise.reps} reps · editar
        </button>

        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button
            onClick={openCalc1RM}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "11px 10px",
              borderRadius: 14,
              border: "1px solid #33312e",
              background: "#1f1e1c",
              color: "#f2ede6",
              fontSize: 13.5,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <Calculator size={15} color={accent.solid} /> Calcular 1RM
          </button>
        </div>

        {records.length === 0 ? (
          <div style={{ color: "#8a8580", fontSize: 14, marginBottom: 20 }}>Sin registros aún.</div>
        ) : (
          <div style={{ border: "1px solid #2a2824", borderRadius: 16, overflow: "hidden", marginBottom: 20 }}>
            <div style={{ display: "flex", padding: "10px 14px", background: "#1a1917", fontSize: 11, color: "#8a8580", fontWeight: 700, letterSpacing: 0.5 }}>
              <div style={{ flex: 1.2 }}>FECHA</div>
              <div style={{ flex: 0.8, textAlign: "right" }}>PESO</div>
              <div style={{ flex: 1, textAlign: "right" }}>SERIES x REPS</div>
            </div>
            {records.map((r) => (
              <div key={r.id} onClick={() => openEditRecord(r)} style={{ display: "flex", padding: "12px 14px", fontSize: 13.5, borderTop: "1px solid #232019", color: "#d7d2ca", cursor: "pointer" }}>
                <div style={{ flex: 1.2 }}>{r.fecha}</div>
                <div style={{ flex: 0.8, textAlign: "right", color: r.peso === pr ? accent.solid : "#d7d2ca", fontWeight: r.peso === pr ? 700 : 400 }}>{r.peso} kg</div>
                <div style={{ flex: 1, textAlign: "right", color: "#a39d95" }}>{r.series}x{r.repeticiones}</div>
              </div>
            ))}
          </div>
        )}

        <DashedButton onClick={openNewRecord}>
          <Plus size={17} /> Nuevo registro
        </DashedButton>

        {restTimerOpen && (
          <RestTimerOverlay
            accent={accent}
            presetIndex={restPresetIndex}
            onPickPreset={pickRestPreset}
            secondsLeft={restSecondsLeft}
            running={restRunning}
            onToggleRunning={() => setRestRunning((v) => !v)}
            onReset={resetRestTimer}
            onClose={() => setRestTimerOpen(false)}
          />
        )}

        {calc1rmOpen && (
          <Calc1RMOverlay
            accent={accent}
            weight={calcWeight}
            reps={calcReps}
            onWeightChange={setCalcWeight}
            onRepsChange={setCalcReps}
            onClose={() => setCalc1rmOpen(false)}
          />
        )}
      </div>
    );
  }

  // ---------- ADD RECORD ----------
  if (screen === "addRecord" && currentExercise) {
    return (
      <div style={shell}>
        {success && <SuccessOverlay message={success} />}
        {recordCelebration && <NewRecordOverlay {...recordCelebration} />}
        <TopBar title={editRecordId ? "Editar registro" : "Nuevo registro"} onBack={() => setScreen("exerciseDetail")} />
        {!editRecordId && sortByFecha(currentExercise.records || [])[0] && (
          <div style={{ fontSize: 12.5, color: "#8a8580", marginTop: -10, marginBottom: 14 }}>
            Última vez: {sortByFecha(currentExercise.records || [])[0].peso} kg · ya lo dejé precargado, ajústalo si cambió.
          </div>
        )}
        <Field label="Fecha" type="date" value={recordForm.fecha} onChange={(e) => setRecordForm({ ...recordForm, fecha: e.target.value })} />
        <Field label="Peso (kg)" type="number" min="0" step="0.5" value={recordForm.peso} onChange={(e) => setRecordForm({ ...recordForm, peso: e.target.value })} placeholder="Ej. 80" />
        <Field label="Series" type="number" min="1" value={recordForm.series} onChange={(e) => setRecordForm({ ...recordForm, series: e.target.value })} placeholder="Ej. 3" />
        <Field label="Repeticiones" type="number" min="1" value={recordForm.repeticiones} onChange={(e) => setRecordForm({ ...recordForm, repeticiones: e.target.value })} placeholder="Ej. 10" />
        {error && <div style={{ color: "#e0725e", fontSize: 13.5, marginBottom: 12 }}>{error}</div>}
        <PrimaryButton onClick={handleSaveRecord}>{editRecordId ? "Guardar cambios" : "Guardar registro"}</PrimaryButton>
        {editRecordId && (
          <button onClick={handleDeleteRecord} style={{ width: "100%", padding: "12px", marginTop: 10, background: "transparent", border: "none", color: "#e07856", fontSize: 14, cursor: "pointer" }}>
            Eliminar registro
          </button>
        )}
      </div>
    );
  }

  return <div style={shell} />;
}
