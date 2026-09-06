import React, { useState, useEffect } from "react";
import { Dumbbell, Plus, ChevronRight, ArrowLeft, Check, Eye, EyeOff, Trophy, Trash2 } from "lucide-react";
import { auth, db } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayISO = () => new Date().toISOString().slice(0, 10);

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
];

function slugify(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

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

// ---------- small UI atoms ----------
function PillButton({ children, onClick, subtitle, compact, muted, onDelete }) {
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
        border: "1px solid #33312e",
        background: "#1f1e1c",
        color: "#f2ede6",
        fontSize: 16,
        fontWeight: 500,
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</div>
        {subtitle && (
          <div style={{ fontSize: 12.5, color: muted ? "#6e6a65" : "#a39d95", marginTop: 3 }}>{subtitle}</div>
        )}
      </span>
      <ChevronRight size={18} color="#6e6a65" style={{ flexShrink: 0 }} />
    </button>
  );
  if (!onDelete) return <div style={{ marginBottom: compact ? 8 : 10 }}>{btn}</div>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: compact ? 8 : 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>{btn}</div>
      <button
        onClick={onDelete}
        style={{ width: 32, flexShrink: 0, border: "none", background: "transparent", color: "#5c5851", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <Trash2 size={15} />
      </button>
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
        background: disabled ? "#4a3a30" : "#d97757",
        color: "#1a1512",
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
        color: "#d97757",
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

function SuccessOverlay({ message }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(15,14,13,0.88)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, zIndex: 50, animation: "fadeIn 0.18s ease-out" }}>
      <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#d97757", display: "flex", alignItems: "center", justifyContent: "center", animation: "popIn 0.35s cubic-bezier(.34,1.56,.64,1)" }}>
        <Check size={32} color="#1a1512" strokeWidth={3} />
      </div>
      <div style={{ color: "#f2ede6", fontSize: 15, fontWeight: 500 }}>{message}</div>
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
  const [showPw, setShowPw] = useState(false);

  const [currentUser, setCurrentUser] = useState(null);
  const [rutina, setRutina] = useState({});
  const [exercisesMap, setExercisesMap] = useState({});
  const [currentDayKey, setCurrentDayKey] = useState(null);
  const [changingCategory, setChangingCategory] = useState(false);
  const [currentExercise, setCurrentExercise] = useState(null);
  const [pendingExerciseName, setPendingExerciseName] = useState(null);
  const [pendingExerciseId, setPendingExerciseId] = useState(null);
  const [editExercise, setEditExercise] = useState(false);
  const [editRecordId, setEditRecordId] = useState(null);

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
        const user = { uid: fbUser.uid, email: fbUser.email, username: profile.username };
        setCurrentUser(user);
        await loadRutina(user);
        setScreen((s) => (s === "login" || s === "register" ? "home" : s));
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  function flashSuccess(message, next) {
    setSuccess(message);
    setTimeout(() => {
      setSuccess(null);
      if (next) next();
    }, 1000);
  }

  async function loadRutina(user) {
    const [rutinaSnap, exercisesSnap] = await Promise.all([
      getDocs(collection(db, "users", user.uid, "rutina")),
      getDocs(collection(db, "users", user.uid, "exercises")),
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
    setLoginForm({ username: "", password: "" });
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
    const day = getDay(currentDayKey);
    const updated = { ...day, category: catKey };
    await saveDay(currentDayKey, updated);
    if (changingCategory) {
      setChangingCategory(false);
      setScreen("dayDetail");
    } else {
      setScreen("addExercise");
    }
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
        await saveExercise(exerciseId, { name, custom: customExerciseMode, category: customExerciseMode ? categoria : undefined, records: [] });
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

  function openExercise(ex) {
    setCurrentExercise(ex);
    setScreen("exerciseDetail");
  }

  function openNewRecord() {
    setRecordForm({ fecha: todayISO(), peso: "", series: String(currentExercise.sets || ""), repeticiones: String(currentExercise.reps || "") });
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
    const exerciseId = currentExercise.exerciseId;
    const exData = exercisesMap[exerciseId] || { name: currentExercise.name, custom: currentExercise.custom, records: [] };
    const currentRecords = exData.records || [];
    let updatedRecords;
    if (editRecordId) {
      updatedRecords = currentRecords.map((r) => (r.id === editRecordId ? { ...r, fecha, peso: Number(peso), series: Number(series) || 0, repeticiones: Number(repeticiones) || 0 } : r));
    } else {
      updatedRecords = [{ id: uid(), fecha, peso: Number(peso), series: Number(series) || 0, repeticiones: Number(repeticiones) || 0 }, ...currentRecords];
    }
    await saveExercise(exerciseId, { ...exData, records: updatedRecords });
    setCurrentExercise({ ...currentExercise, records: updatedRecords });
    flashSuccess("Registro guardado", () => {
      setEditRecordId(null);
      setScreen("exerciseDetail");
    });
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
        <div style={{ marginTop: 40, marginBottom: 40 }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: "#d97757", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
            <Dumbbell size={26} color="#1a1512" />
          </div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>MiRutina</div>
          <div style={{ fontSize: 14, color: "#a39d95", marginTop: 4 }}>Inicia sesión para continuar</div>
        </div>
        <Field label="Usuario" value={loginForm.username} onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })} placeholder="tu_usuario" />
        <div style={{ position: "relative" }}>
          <Field label="Contraseña" type={showPw ? "text" : "password"} value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} placeholder="••••••••" />
          <button onClick={() => setShowPw(!showPw)} style={{ position: "absolute", right: 14, top: 32, background: "none", border: "none", color: "#8a8580", cursor: "pointer" }}>
            {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {error && <div style={{ color: "#e0725e", fontSize: 13.5, marginBottom: 12 }}>{error}</div>}
        <div style={{ marginTop: 8 }}>
          <PrimaryButton onClick={handleLogin}>Iniciar sesión</PrimaryButton>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20, fontSize: 13.5 }}>
          <button onClick={() => { setError(""); setScreen("register"); }} style={{ background: "none", border: "none", color: "#d97757", cursor: "pointer", padding: 0 }}>
            Crear cuenta nueva
          </button>
          <button onClick={() => { setError(""); setScreen("recover"); }} style={{ background: "none", border: "none", color: "#a39d95", cursor: "pointer", padding: 0 }}>
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 40 }}>
          <div>
            {currentUser?.username && <div style={{ fontSize: 16, fontWeight: 600, color: "#d97757", marginBottom: 4 }}>{currentUser.username}</div>}
            <div style={{ fontSize: 22, fontWeight: 700 }}>MiRutina</div>
          </div>
          <button onClick={logout} style={{ background: "none", border: "none", color: "#8a8580", fontSize: 13, cursor: "pointer", marginTop: 4 }}>
            Salir
          </button>
        </div>
        <PillButton onClick={() => setScreen("days")}>Mi rutina</PillButton>
      </div>
    );
  }

  // ---------- DAYS LIST ----------
  if (screen === "days") {
    return (
      <div style={shell}>
        <TopBar title="Mi rutina" onBack={() => setScreen("home")} />
        {DAYS.map((d) => {
          const day = getDay(d.key);
          return (
            <PillButton key={d.key} compact onClick={() => openDay(d.key)} subtitle={day.category ? categoryLabel(day.category) : "Sin rutina asignada"} muted={!day.category}>
              {d.label}
            </PillButton>
          );
        })}
      </div>
    );
  }

  // ---------- CHOOSE CATEGORY ----------
  if (screen === "chooseCategory" && currentDayKey) {
    const dayLabel = DAYS.find((d) => d.key === currentDayKey)?.label;
    return (
      <div style={shell}>
        <TopBar title={dayLabel} onBack={() => { setChangingCategory(false); setScreen(getDay(currentDayKey).category ? "dayDetail" : "days"); }} />
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>¿Qué vas a entrenar?</div>
        {CATEGORIES.map((c) => (
          <PillButton key={c.key} compact onClick={() => chooseCategory(c.key)}>
            {c.label}
          </PillButton>
        ))}
        <div style={{ marginTop: 10 }}>
          <PillButton compact muted onClick={() => chooseCategory("personalizada")} subtitle="Mezcla ejercicios de cualquier categoría">
            Personalizada
          </PillButton>
          <PillButton compact muted onClick={() => chooseCategory("descanso")} subtitle="Día libre, sin ejercicios">
            Descanso
          </PillButton>
        </div>
      </div>
    );
  }

  // ---------- DAY DETAIL ----------
  if (screen === "dayDetail" && currentDayKey) {
    const dayLabel = DAYS.find((d) => d.key === currentDayKey)?.label;
    const day = getDay(currentDayKey);
    const exercises = combinedDayExercises(currentDayKey);
    const isRestDay = day.category === "descanso";
    return (
      <div style={shell}>
        <TopBar title={dayLabel} onBack={() => setScreen("days")} />
        <button
          onClick={() => { setChangingCategory(true); setScreen("chooseCategory"); }}
          style={{ background: "none", border: "none", color: "#6e6a65", fontSize: 12, cursor: "pointer", padding: 0, marginBottom: 20, display: "block" }}
        >
          Rutina: {categoryLabel(day.category)} · cambiar
        </button>

        {isRestDay ? (
          <div style={{ color: "#a39d95", fontSize: 14.5, textAlign: "center", padding: "30px 0" }}>Día de descanso 🛌</div>
        ) : (
          <>
            {exercises.length === 0 ? (
              <div style={{ color: "#8a8580", fontSize: 14, marginBottom: 16 }}>Aún no has agregado ejercicios.</div>
            ) : (
              exercises.map((ex) => {
                const pr = prOf(ex);
                return (
                  <PillButton
                    key={ex.exerciseId}
                    onClick={() => openExercise(ex)}
                    onDelete={() => quickDeleteExercise(ex)}
                    subtitle={`${pr !== null ? `PR: ${pr} kg` : "Sin PR"} · ${ex.sets}x${ex.reps} reps`}
                  >
                    {ex.name}
                  </PillButton>
                );
              })
            )}

            <div style={{ marginTop: 6 }}>
              <DashedButton onClick={openAddExercise}>
                <Plus size={17} /> Agregar ejercicio
              </DashedButton>
            </div>
          </>
        )}
      </div>
    );
  }

  // ---------- ADD EXERCISE (todas las categorías) ----------
  if (screen === "addExercise" && currentDayKey) {
    const day = getDay(currentDayKey);
    const alreadyIds = new Set((day.plan || []).map((p) => p.exerciseId));
    const sections = CATEGORIES.map((cat) => {
      const fixed = cat.exercises.filter((name) => !alreadyIds.has("fx-" + slugify(name))).map((name) => ({ id: "fx-" + slugify(name), name }));
      const customs = Object.entries(exercisesMap)
        .filter(([id, ex]) => ex.custom && ex.category === cat.key && !alreadyIds.has(id))
        .map(([id, ex]) => ({ id, name: ex.name }));
      return { key: cat.key, label: cat.label, items: [...fixed, ...customs] };
    }).filter((s) => s.items.length > 0);
    const orphanCustoms = Object.entries(exercisesMap).filter(([id, ex]) => ex.custom && !ex.category && !alreadyIds.has(id));

    return (
      <div style={shell}>
        <TopBar title="Agregar ejercicio" onBack={() => setScreen("dayDetail")} />
        {sections.length === 0 && orphanCustoms.length === 0 && (
          <div style={{ color: "#8a8580", fontSize: 14, marginBottom: 16 }}>Ya agregaste todos los ejercicios disponibles.</div>
        )}
        {sections.map((s) => (
          <div key={s.key} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: "#8a8580", fontWeight: 700, letterSpacing: 0.4, marginBottom: 8 }}>{s.label.toUpperCase()}</div>
            {s.items.map((it) => (
              <PillButton key={it.id} compact onClick={() => openExerciseForm(it.name, it.id)}>
                {it.name}
              </PillButton>
            ))}
          </div>
        ))}

        {orphanCustoms.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: "#8a8580", fontWeight: 700, letterSpacing: 0.4, marginBottom: 8 }}>OTROS PERSONALIZADOS</div>
            {orphanCustoms.map(([id, ex]) => (
              <PillButton key={id} compact onClick={() => openExerciseForm(ex.name, id)}>
                {ex.name}
              </PillButton>
            ))}
          </div>
        )}

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
              options={CATEGORIES.map((c) => ({ value: c.key, label: c.label }))}
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
        <TopBar title={currentExercise.name} onBack={() => setScreen("dayDetail")} />

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#2a2320", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Trophy size={19} color="#d97757" />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{pr !== null ? `${pr} kg` : "Sin registros aún"}</div>
            <div style={{ fontSize: 12, color: "#8a8580" }}>Récord personal (PR)</div>
          </div>
        </div>

        <button onClick={() => openEditExercisePlan(currentExercise)} style={{ background: "none", border: "none", color: "#a39d95", fontSize: 12.5, cursor: "pointer", padding: 0, marginBottom: 20 }}>
          Plan: {currentExercise.sets}x{currentExercise.reps} reps · editar
        </button>

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
                <div style={{ flex: 0.8, textAlign: "right", color: r.peso === pr ? "#d97757" : "#d7d2ca", fontWeight: r.peso === pr ? 700 : 400 }}>{r.peso} kg</div>
                <div style={{ flex: 1, textAlign: "right", color: "#a39d95" }}>{r.series}x{r.repeticiones}</div>
              </div>
            ))}
          </div>
        )}

        <DashedButton onClick={openNewRecord}>
          <Plus size={17} /> Nuevo registro
        </DashedButton>
      </div>
    );
  }

  // ---------- ADD RECORD ----------
  if (screen === "addRecord" && currentExercise) {
    return (
      <div style={shell}>
        {success && <SuccessOverlay message={success} />}
        <TopBar title={editRecordId ? "Editar registro" : "Nuevo registro"} onBack={() => setScreen("exerciseDetail")} />
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
