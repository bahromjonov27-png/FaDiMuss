"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { User } from "firebase/auth";
import {
  addDoc, collection, deleteDoc, deleteField, doc, getDoc, getDocs, onSnapshot,
  query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch,
} from "firebase/firestore";
import {
  ArrowRight, ArrowUpRight, Award, BookOpen, BrainCircuit,
  CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, CircleHelp, Clock3, Compass,
  Flame, Focus, Home, Lightbulb, LogOut, Menu, Pencil, Plus, Search, Send, Sparkles, Target,
  Trash2, UserRound, X,
} from "lucide-react";
import { buildDailyPlan } from "@/features/planner/priority";
import { talentQuestions, scoreTalentAssessment, talentCategories } from "@/features/talent/scoring";
import { matchSkillProfiles, type SkillProfile } from "@/features/skills/matching";
import { levelForXp } from "@/features/gamification/points";

function formatMentorInline(text: string): ReactNode[] {
  return text.split(/(\*\*.+?\*\*|\*.+?\*|`[^`]+`)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    return part;
  });
}

function formatMentorAnswer(text: string): ReactNode {
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];
  let orderedList = false;
  const flushList = () => {
    if (!listItems.length) return;
    const List = orderedList ? "ol" : "ul";
    blocks.push(<List key={`list-${blocks.length}`}>{listItems.map((item, index) => <li key={index}>{formatMentorInline(item)}</li>)}</List>);
    listItems = [];
  };

  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }
    const listMatch = trimmed.match(/^(?:[-*]\s+|\d+[.)]\s+)(.+)$/);
    if (listMatch) {
      const isOrdered = /^\d/.test(trimmed);
      if (listItems.length && orderedList !== isOrdered) flushList();
      orderedList = isOrdered;
      listItems.push(listMatch[1]);
      return;
    }
    flushList();
    const headingMatch = trimmed.match(/^#{1,3}\s+(.+)$/);
    blocks.push(headingMatch
      ? <h4 key={`heading-${blocks.length}`}>{formatMentorInline(headingMatch[1])}</h4>
      : <p key={`paragraph-${blocks.length}`}>{formatMentorInline(trimmed)}</p>);
  });
  flushList();
  return <div className="mentor-answer-text">{blocks}</div>;
}
import { db } from "@/lib/firebase/client";
import type { FocusSession, Goal, StudentProfile, StudyTask } from "@/lib/models";

type Section = "overview" | "planner" | "mentor" | "focus" | "talent" | "skills" | "profile";
type Flash = { kind: "success" | "error"; message: string } | null;

const navigation: Array<{ id: Section; label: string; icon: typeof Home }> = [
  { id: "overview", label: "Umumiy ko'rinish", icon: Home },
  { id: "planner", label: "Rejalarim", icon: CalendarDays },
  { id: "mentor", label: "AI Mentor", icon: BrainCircuit },
  { id: "focus", label: "Fokus", icon: Focus },
  { id: "talent", label: "Qobiliyatlar", icon: Compass },
  { id: "skills", label: "Skill Swap", icon: BookOpen },
];

const categoryLabels: Record<string, string> = {
  communication: "Muloqot", creativity: "Ijodkorlik", analytical: "Tahliliy fikrlash",
  technical: "Texnik yechim", leadership: "Jamoaviy yetakchilik",
};

type MentorMessage = { role: "user" | "model"; text: string };

export default function Workspace({
  user, profile, onProfileChange, onSignOut,
}: {
  user: User;
  profile: StudentProfile;
  onProfileChange: (profile: StudentProfile) => void;
  onSignOut: () => Promise<void>;
}) {
  const [section, setSection] = useState<Section>("overview");
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [focusSessions, setFocusSessions] = useState<FocusSession[]>([]);
  const [flash, setFlash] = useState<Flash>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dataError, setDataError] = useState(() => db ? "" : "Firebase sozlamasi topilmadi. .env.local qiymatlarini tekshiring.");
  const [dataReady, setDataReady] = useState(() => !db);
  const activeGoals = goals.filter((goal) => goal.status === "active");
  const plan = useMemo(() => buildDailyPlan(
    tasks.filter((task) => task.status === "todo").map((task) => ({
      id: task.id, title: task.title, estimatedMinutes: task.estimatedMinutes,
      importance: task.importance, dueAt: task.dueAt?.toMillis(), goalId: task.goalId,
      goalIsActive: activeGoals.some((goal) => goal.id === task.goalId),
    })), profile.dailyAvailableMinutes,
  ), [tasks, profile.dailyAvailableMinutes, activeGoals]);
  const completedTasks = tasks.filter((task) => task.status === "completed").length;
  const todaySessions = focusSessions.filter((session) => session.startedAt?.toDate().toDateString() === new Date().toDateString());
  const todayFocus = todaySessions.filter((session) => session.sessionType === "focus").reduce((sum, session) => sum + session.actualMinutes, 0);

  useEffect(() => {
    if (!db) return;
    const stopTasks = onSnapshot(query(collection(db, "tasks"), where("userId", "==", user.uid)),
      (snapshot) => { setTasks(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as StudyTask)); setDataReady(true); },
      () => { setDataError("Vazifalarni yuklab bo'lmadi. Firestore qoidalarini tekshiring."); setDataReady(true); });
    const stopGoals = onSnapshot(query(collection(db, "goals"), where("userId", "==", user.uid)),
      (snapshot) => setGoals(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Goal)),
      () => setDataError("Maqsadlarni yuklab bo'lmadi."));
    const stopSessions = onSnapshot(query(collection(db, "focusSessions"), where("userId", "==", user.uid)),
      (snapshot) => setFocusSessions(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as FocusSession)),
      () => undefined);
    return () => { stopTasks(); stopGoals(); stopSessions(); };
  }, [user.uid]);

  useEffect(() => {
    if (!flash) return;
    const timeout = window.setTimeout(() => setFlash(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [flash]);

  async function saveTask(values: { title: string; goalId: string; dueAt: string; estimatedMinutes: number; importance: number }) {
    if (!db) throw new Error("Firebase sozlanmagan.");
    await addDoc(collection(db, "tasks"), {
      userId: user.uid, title: values.title.trim(), description: "",
      goalId: values.goalId || undefined,
      dueAt: values.dueAt ? Timestamp.fromDate(new Date(`${values.dueAt}T23:59:00`)) : undefined,
      estimatedMinutes: values.estimatedMinutes, importance: values.importance,
      status: "todo", createdAt: serverTimestamp(),
    });
  }

  async function toggleTask(task: StudyTask) {
    if (!db) return;
    try {
      const nextStatus = task.status === "todo" ? "completed" : "todo";
      await updateDoc(doc(db, "tasks", task.id), {
        status: nextStatus,
        completedAt: nextStatus === "completed" ? serverTimestamp() : null,
      });
      if (nextStatus === "completed") {
      const token = await user.getIdToken();
      const response = await fetch("/api/tasks/complete", {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ taskId: task.id }),
      });
      const result = await response.json() as { pointsAwarded?: number; alreadyAwarded?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error ?? "XP hisoblanmadi.");
      setFlash({ kind: "success", message: result.alreadyAwarded ? "Vazifa bajarildi." : `Vazifa bajarildi. +${result.pointsAwarded} XP` });
      const userSnapshot = await getDoc(doc(db, "users", user.uid));
      if (userSnapshot.exists()) onProfileChange({ ...profile, ...userSnapshot.data() } as StudentProfile);
      } else setFlash({ kind: "success", message: "Vazifa qayta ochildi." });
    } catch (error) {
      setFlash({ kind: "error", message: error instanceof Error ? error.message : "Vazifa holati saqlanmadi." });
    }
  }

  async function removeTask(taskId: string) {
    if (!db) return;
    try { await deleteDoc(doc(db, "tasks", taskId)); setFlash({ kind: "success", message: "Vazifa o'chirildi." }); }
    catch { setFlash({ kind: "error", message: "Vazifa o'chirilmadi." }); }
  }

  async function updateTask(taskId: string, values: { title: string; goalId: string; dueAt: string; estimatedMinutes: number; importance: number }) {
    if (!db) throw new Error("Firebase sozlanmagan.");
    await updateDoc(doc(db, "tasks", taskId), {
      title: values.title.trim(), goalId: values.goalId || deleteField(),
      dueAt: values.dueAt ? Timestamp.fromDate(new Date(`${values.dueAt}T23:59:00`)) : deleteField(),
      estimatedMinutes: values.estimatedMinutes, importance: values.importance,
    });
  }

  async function createGoal(title: string, category: string, targetDate: string) {
    if (!db) throw new Error("Firebase sozlanmagan.");
    await addDoc(collection(db, "goals"), {
      userId: user.uid, title: title.trim(), description: "", category, status: "active",
      targetDate: targetDate ? Timestamp.fromDate(new Date(`${targetDate}T23:59:00`)) : undefined,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  }

  async function updateGoal(goalId: string, values: { title: string; category: string; targetDate: string; status: Goal["status"] }) {
    if (!db) throw new Error("Firebase sozlanmagan.");
    await updateDoc(doc(db, "goals", goalId), {
      title: values.title.trim(), category: values.category, status: values.status,
      targetDate: values.targetDate ? Timestamp.fromDate(new Date(`${values.targetDate}T23:59:00`)) : deleteField(),
      updatedAt: serverTimestamp(),
    });
  }

  async function removeGoal(goalId: string) {
    const firestore = db;
    if (!firestore) return;
    const batch = writeBatch(firestore);
    tasks.filter((task) => task.goalId === goalId).forEach((task) => batch.update(doc(firestore, "tasks", task.id), { goalId: deleteField() }));
    batch.delete(doc(firestore, "goals", goalId));
    try { await batch.commit(); setFlash({ kind: "success", message: "Maqsad o'chirildi; bog'langan vazifalar saqlanib qoldi." }); }
    catch { setFlash({ kind: "error", message: "Maqsad o'chirilmadi." }); }
  }

  async function saveProfile(values: Partial<StudentProfile>) {
    if (!db) throw new Error("Firebase sozlanmagan.");
    await setDoc(doc(db, "users", user.uid), { ...values, uid: user.uid, updatedAt: serverTimestamp() }, { merge: true });
    onProfileChange({ ...profile, ...values });
    setFlash({ kind: "success", message: "Profil saqlandi." });
  }

  function choose(next: Section) { setSection(next); setMobileOpen(false); setFlash(null); }

  if (!dataReady) return <main className="loading-screen"><span className="loader" /> Ma'lumotlar yuklanmoqda</main>;

  return <div className="workspace-shell">
    <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
      <a href="#dashboard" className="brand"><span className="brand-mark">F</span><span>FaDiMuss<small>O'QISH VA RIVOJLANISH</small></span></a>
      <div className="workspace-label">MENING MAKONIM</div>
      <nav className="main-nav" aria-label="Asosiy navigatsiya">
        {navigation.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => choose(id)} className={`nav-item ${section === id ? "active" : ""}`} aria-current={section === id ? "page" : undefined}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{id === "mentor" && <Sparkles className="nav-sparkle" size={13} />}</button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="streak-box"><div className="streak-icon"><Flame size={17} /></div><div><b>{profile.streak ?? 0} kunlik streak</b><small>Izchil qadamlar qadrlanadi</small></div><ArrowUpRight size={15} /></div>
        <button className={`nav-item ${section === "profile" ? "active" : ""}`} aria-current={section === "profile" ? "page" : undefined} onClick={() => choose("profile")}><UserRound size={18} /><span>Profil va sozlamalar</span></button>
        <div className="user-row"><div className="avatar">{profile.displayName?.slice(0, 1).toUpperCase() ?? "F"}</div><div className="user-meta"><b>{profile.displayName}</b><small>{profile.email}</small></div><button className="icon-button" title="Hisobdan chiqish" aria-label="Hisobdan chiqish" onClick={onSignOut}><LogOut size={16} /></button></div>
      </div>
    </aside>
    {mobileOpen && <button className="mobile-scrim" aria-label="Menyuni yopish" onClick={() => setMobileOpen(false)} />}
    <main className="main-area">
      <header className="topbar"><button className="icon-button mobile-menu" aria-label="Menyuni ochish" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><div className="breadcrumbs">FaDiMuss <span>/</span> {navigation.find((item) => item.id === section)?.label ?? "Profil"}</div><div className="topbar-actions"><span className="today-date">{new Intl.DateTimeFormat("uz-UZ", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</span><span className="avatar avatar-small">{profile.displayName?.slice(0, 1).toUpperCase() ?? "F"}</span></div></header>
      <div className={`page-content section-${section}`}>
        {dataError && <div className="inline-error" role="alert">{dataError}</div>}
        {flash && <div className={`toast toast-${flash.kind}`} role={flash.kind === "error" ? "alert" : "status"}>{flash.kind === "success" ? <CheckCircle2 size={17} /> : <CircleHelp size={17} />}{flash.message}<button className="icon-button" onClick={() => setFlash(null)} aria-label="Xabarni yopish"><X size={15} /></button></div>}
        {section === "overview" && <Overview profile={profile} tasks={tasks} goals={activeGoals} plan={plan} completedTasks={completedTasks} todayFocus={todayFocus} onNavigate={choose} onToggleTask={toggleTask} />}
        {section === "planner" && <Planner tasks={tasks} goals={goals} plan={plan} onSaveTask={saveTask} onUpdateTask={updateTask} onCreateGoal={createGoal} onUpdateGoal={updateGoal} onRemoveGoal={removeGoal} onToggleTask={toggleTask} onRemoveTask={removeTask} />}
        {section === "mentor" && <Mentor user={user} profile={profile} goals={activeGoals} tasks={tasks} focusMinutes={todayFocus} />}
        {section === "focus" && <FocusPage user={user} sessions={focusSessions} onSessionFinished={async () => { if (!db) return; const snapshot = await getDoc(doc(db, "users", user.uid)); if (snapshot.exists()) onProfileChange({ ...profile, ...snapshot.data() } as StudentProfile); }} />}
        {section === "talent" && <Talent user={user} />}
        {section === "skills" && <SkillSwap user={user} profile={profile} setFlash={setFlash} />}
        {section === "profile" && <Profile profile={profile} onSave={saveProfile} onSignOut={onSignOut} />}
      </div>
    </main>
  </div>;
}

function Overview({ profile, tasks, goals, plan, completedTasks, todayFocus, onNavigate, onToggleTask }: {
  profile: StudentProfile; tasks: StudyTask[]; goals: Goal[]; plan: ReturnType<typeof buildDailyPlan>;
  completedTasks: number; todayFocus: number; onNavigate: (section: Section) => void;
  onToggleTask: (task: StudyTask) => Promise<void>;
}) {
  const goalProgress = tasks.length ? Math.round(completedTasks / tasks.length * 100) : 0;
  const [search, setSearch] = useState("");
  const today = new Date();
  const todayKey = today.toDateString();
  const weekStart = new Date(today);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return date;
  });
  const filteredTasks = tasks.filter((task) => task.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const tasksForDay = (date: Date) => {
    const dueTasks = filteredTasks.filter((task) => task.status === "todo" && task.dueAt?.toDate().toDateString() === date.toDateString());
    return date.toDateString() === todayKey
      ? [...plan.scheduled.map((item) => ({ id: item.taskId, title: item.title, minutes: item.minutes })), ...dueTasks.filter((task) => !plan.scheduled.some((item) => item.taskId === task.id))]
      : dueTasks;
  };
  const quickActions = [
    { title: "Rejalarim", detail: `${tasks.filter((task) => task.status === "todo").length} ta faol vazifa`, icon: CalendarDays, section: "planner" as Section },
    { title: "Qobiliyatlar", detail: "Kuchli tomonlarni baholash", icon: Compass, section: "talent" as Section },
    { title: "Ko'nikma almashish", detail: "O'quv sherigi topish", icon: BookOpen, section: "skills" as Section },
    { title: "AI Mentor", detail: "Savolingizni bering", icon: BrainCircuit, section: "mentor" as Section },
  ];
  return <>
    <div className="dashboard-welcome">
      <div className="dashboard-greeting"><h1>Salom, {profile.displayName?.split(" ")[0]}! <span aria-hidden="true">👋</span></h1><p>{todayFocus ? `Bugun ${todayFocus} daqiqa fokus qildingiz. Kichik g'alabalarni davom ettiring.` : "Bugun o'zingiz uchun kichik g'alabalar yarating."}</p></div>
      <label className="dashboard-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Qidiruv... (vazifalar)" aria-label="Vazifalardan qidirish" /></label>
      <span className="dashboard-date">{new Intl.DateTimeFormat("uz-UZ", { weekday: "long", day: "numeric", month: "short" }).format(today)}</span>
    </div>
    <div className="dashboard-columns">
      <div className="dashboard-primary">
        <section className="weekly-panel">
          <div className="dashboard-section-heading"><h2><span><CalendarDays size={17} /></span> Haftalik o'qish rejasi</h2><button className="text-link" onClick={() => onNavigate("planner")}>To'liq reja <ArrowRight size={14} /></button></div>
          <div className="weekly-grid">{weekDays.map((date, index) => {
            const dayTasks = tasksForDay(date);
            return <div className={`week-day ${date.toDateString() === todayKey ? "week-day-today" : ""}`} key={date.toISOString()}>
              <div className="week-day-heading"><b>{new Intl.DateTimeFormat("uz-UZ", { weekday: "long" }).format(date)}</b><span>{new Intl.DateTimeFormat("uz-UZ", { day: "numeric", month: "short" }).format(date)}</span></div>
              {dayTasks.length ? dayTasks.slice(0, 3).map((task, taskIndex) => <button className={`week-task week-task-${taskIndex % 4}`} key={`${task.id}-${taskIndex}`} onClick={() => onNavigate("planner")} title={task.title}><b>{task.title}</b><small>{"minutes" in task ? `${task.minutes} daqiqa` : `${task.estimatedMinutes} daqiqa`}</small></button>)
                : <div className="week-day-empty">{index === 6 ? <><Sparkles size={14} /><span>Dam olish vaqti</span></> : <span>Reja yo'q</span>}</div>}
            </div>;
          })}</div>
        </section>
        <div className="dashboard-card-row">
          <section className="dashboard-tasks-card">
            <div className="dashboard-section-heading"><h2><span><Check size={17} /></span> Bugungi vazifalar</h2><button className="text-link" onClick={() => onNavigate("planner")}>Barchasi <ArrowRight size={14} /></button></div>
            <div className="dashboard-task-list">{filteredTasks.filter((task) => task.status === "todo").slice(0, 3).map((task) => <div className="dashboard-task" key={task.id}>
              <button className="dashboard-task-check" aria-label={`${task.title} bajarildi`} onClick={() => void onToggleTask(task)}><Check size={13} /></button>
              <div><b>{task.title}</b><small>{goals.find((goal) => goal.id === task.goalId)?.title ?? "Shaxsiy vazifa"}</small></div>
              <span>{task.dueAt ? new Intl.DateTimeFormat("uz-UZ", { day: "numeric", month: "short" }).format(task.dueAt.toDate()) : `${task.estimatedMinutes} daq.`}</span>
            </div>)}
              {!filteredTasks.some((task) => task.status === "todo") && <p className="dashboard-empty-tasks">{search ? "Qidiruv bo'yicha vazifa topilmadi." : "Faol vazifalar yo'q. Yangi vazifa qo'shing."}</p>}
            </div>
          </section>
          <section className="semester-card">
            <div className="dashboard-section-heading"><h2><span><Target size={17} /></span> Maqsad progressi</h2></div>
            <div className="semester-ring" style={{ background: `conic-gradient(#4d45ed ${goalProgress}%, #e9edf8 ${goalProgress}% 100%)` }}><div><b>{goalProgress}%</b><small>bajarildi</small></div></div>
            <p>{completedTasks} / {tasks.length} vazifa</p>
            <button className="text-link" onClick={() => onNavigate("planner")}>{goals[0]?.title ?? "Maqsad qo'shish"} <ArrowRight size={13} /></button>
          </section>
          <section className="streak-card">
            <div className="dashboard-section-heading"><h2><span><Flame size={17} /></span> O'qish streak</h2></div>
            <small>Izchillik — katta yutuqning asosi</small>
            <b className="streak-total">{profile.streak ?? 0} kun</b>
            <div className="streak-week">{weekDays.map((date, index) => <div className={(index >= Math.max(0, 7 - (profile.streak ?? 0))) ? "streak-day active" : "streak-day"} key={date.toISOString()}><span>{index >= Math.max(0, 7 - (profile.streak ?? 0)) ? <Check size={11} /> : "·"}</span><small>{new Intl.DateTimeFormat("uz-UZ", { weekday: "narrow" }).format(date)}</small></div>)}</div>
            <button className="text-link" onClick={() => onNavigate("focus")}>Fokusni boshlash <ArrowRight size={13} /></button>
          </section>
        </div>
      </div>
      <aside className="dashboard-aside">
        <section className="dashboard-mentor-card"><span className="dashboard-card-kicker"><Sparkles size={14} /> AI MENTOR</span><h2>Bugun nimadan<br />boshlaymiz?</h2><p>Maqsadlaringiz va vazifalaringiz asosida keyingi qadamni aniqlang.</p><button onClick={() => onNavigate("mentor")}>Mentor bilan suhbat <ArrowRight size={15} /></button></section>
        <section className="daily-tip-card"><span><Lightbulb size={17} /> BUGUNGI MASLAHAT</span><blockquote>“25 daqiqa fokus + 5 daqiqa tanaffus.”</blockquote><p>Qisqa, diqqat bilan ishlash katta vazifalarni yengillashtiradi.</p><button onClick={() => onNavigate("focus")} aria-label="Fokus sahifasini ochish"><Focus size={20} /></button></section>
      </aside>
    </div>
    <section className="study-together-panel">
      <div className="dashboard-section-heading"><h2><span><BookOpen size={17} /></span> Birga o'rganamiz</h2><button className="text-link" onClick={() => onNavigate("skills")}>Ko'nikma almashish <ArrowRight size={14} /></button></div>
      <div className="study-card-grid">{quickActions.map(({ title, detail, icon: Icon, section }) => <button className="study-action-card" key={title} onClick={() => onNavigate(section)}><span><Icon size={20} /></span><div><b>{title}</b><small>{detail}</small></div><ArrowRight size={15} /></button>)}</div>
    </section>
  </>;
}

function Planner({ tasks, goals, plan, onSaveTask, onUpdateTask, onCreateGoal, onUpdateGoal, onRemoveGoal, onToggleTask, onRemoveTask }: {
  tasks: StudyTask[]; goals: Goal[]; plan: ReturnType<typeof buildDailyPlan>;
  onSaveTask: (values: { title: string; goalId: string; dueAt: string; estimatedMinutes: number; importance: number }) => Promise<void>;
  onUpdateTask: (id: string, values: { title: string; goalId: string; dueAt: string; estimatedMinutes: number; importance: number }) => Promise<void>;
  onCreateGoal: (title: string, category: string, targetDate: string) => Promise<void>;
  onUpdateGoal: (id: string, values: { title: string; category: string; targetDate: string; status: Goal["status"] }) => Promise<void>;
  onRemoveGoal: (id: string) => Promise<void>;
  onToggleTask: (task: StudyTask) => Promise<void>; onRemoveTask: (id: string) => Promise<void>;
}) {
  const [form, setForm] = useState<"task" | "goal" | null>(null);
  const [filter, setFilter] = useState<"todo" | "completed" | "all">("todo");
  const [weekOffset, setWeekOffset] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const visibleTasks = tasks.filter((task) => filter === "all" || task.status === filter);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskGoal, setTaskGoal] = useState("");
  const [taskDate, setTaskDate] = useState("");
  const [taskMinutes, setTaskMinutes] = useState(30);
  const [importance, setImportance] = useState(3);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalCategory, setGoalCategory] = useState("O'qish");
  const [goalDate, setGoalDate] = useState("");
  const [editingTask, setEditingTask] = useState<StudyTask | null>(null);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [editValues, setEditValues] = useState({ title: "", goalId: "", dueAt: "", estimatedMinutes: 30, importance: 3 });
  const [goalEditValues, setGoalEditValues] = useState({ title: "", category: "O'qish", targetDate: "", status: "active" as Goal["status"] });
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7) + weekOffset * 7);
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return date;
  });
  const plannedTasks = [...new Map(plan.scheduled.map((item) => {
    const existing = plan.scheduled.filter((scheduled) => scheduled.taskId === item.taskId);
    return [item.taskId, {
      ...item,
      minutes: existing.reduce((total, scheduled) => total + scheduled.minutes, 0),
    }] as const;
  })).values()];
  const activeTasks = tasks.filter((task) => task.status === "todo");
  const goalProgress = (goalId: string) => {
    const goalTasks = tasks.filter((task) => task.goalId === goalId);
    return goalTasks.length ? Math.round(goalTasks.filter((task) => task.status === "completed").length / goalTasks.length * 100) : 0;
  };

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try { await onSaveTask({ title: taskTitle, goalId: taskGoal, dueAt: taskDate, estimatedMinutes: taskMinutes, importance }); setTaskTitle(""); setForm(null); }
    catch { setError("Vazifa saqlanmadi. Qayta urinib ko'ring."); } finally { setSaving(false); }
  }
  async function submitGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try { await onCreateGoal(goalTitle, goalCategory, goalDate); setGoalTitle(""); setForm(null); }
    catch { setError("Maqsad saqlanmadi. Qayta urinib ko'ring."); } finally { setSaving(false); }
  }
  async function submitTaskEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editingTask) return;
    setSaving(true); setError("");
    try { await onUpdateTask(editingTask.id, editValues); setEditingTask(null); }
    catch { setError("Vazifa yangilanmadi. Qayta urinib ko'ring."); }
    finally { setSaving(false); }
  }
  async function submitGoalEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editingGoal) return;
    setSaving(true); setError("");
    try { await onUpdateGoal(editingGoal.id, goalEditValues); setEditingGoal(null); }
    catch { setError("Maqsad yangilanmadi. Qayta urinib ko'ring."); }
    finally { setSaving(false); }
  }
  function startTaskEdit(task: StudyTask) {
    setEditingTask(task);
    setEditValues({
      title: task.title, goalId: task.goalId ?? "",
      dueAt: task.dueAt?.toDate().toISOString().slice(0, 10) ?? "",
      estimatedMinutes: task.estimatedMinutes, importance: task.importance,
    });
    setError("");
  }
  function startGoalEdit(goal: Goal) {
    setEditingGoal(goal);
    setGoalEditValues({
      title: goal.title, category: goal.category,
      targetDate: goal.targetDate?.toDate().toISOString().slice(0, 10) ?? "",
      status: goal.status,
    });
    setError("");
  }

  return <>
    <div className="page-title-row planner-page-title"><div><span className="eyebrow">MAQSADLAR VA VAZIFALAR</span><h1>Rejalaringiz.</h1><p>Kichik qadamlar, katta natijalar.</p></div><div className="title-actions"><button className="button button-outline" onClick={() => setForm("goal")}><Target size={16} /> Maqsad yaratish</button><button className="button button-navy" onClick={() => setForm("task")}><Plus size={16} /> Vazifa qo'shish</button></div></div>
    <div className="planner-summary">
      <div className="planner-stat"><span className="planner-stat-icon"><Target size={18} /></span><div><small>KUNLIK MAQSAD</small><b>{plan.availableMinutes} daqiqa</b><span>o'qish va rivojlanish</span></div></div>
      <div className="planner-stat"><span className="planner-stat-icon"><CheckCircle2 size={18} /></span><div><small>BUGUNGI VAZIFALAR</small><b>{activeTasks.length} ta</b><span>bajarilishi kerak</span></div></div>
      <div className="planner-week-summary"><small>HAFTALIK FAOLLIK</small><div>{weekDays.map((date) => {
        const dayTasks = tasks.filter((task) => task.dueAt?.toDate().toDateString() === date.toDateString());
        return <span className={dayTasks.length ? "has-activity" : ""} key={date.toISOString()} title={`${dayTasks.length} ta muddatli vazifa`}>{new Intl.DateTimeFormat("uz-UZ", { weekday: "narrow" }).format(date)}<i>{dayTasks.length ? dayTasks.length : ""}</i></span>;
      })}</div></div>
      <blockquote><span>“</span><p>Bugun qilgan har bir kichik qadam kelajakdagi katta natijalarga olib boradi.</p></blockquote>
    </div>
    <div className="planner-columns">
      <div className="planner-primary-column">
      <section className="planner-today-panel">
        <div className="planner-today-heading"><div><h2><CalendarDays size={19} /> Bugungi reja</h2><span>{new Intl.DateTimeFormat("uz-UZ", { day: "numeric", month: "long", weekday: "long" }).format(new Date())}</span></div><div className="planner-day-progress"><div><b>{tasks.length ? Math.round(tasks.filter((task) => task.status === "completed").length / tasks.length * 100) : 0}%</b><small>bajarilgan</small></div><span>{tasks.filter((task) => task.status === "completed").length} / {tasks.length} vazifa</span></div></div>
        <div className="planner-timeline">{plannedTasks.length ? plannedTasks.slice(0, 5).map((item, index) => {
          const task = tasks.find((candidate) => candidate.id === item.taskId);
          if (!task) return null;
          return <div className={`planner-timeline-row ${task.status === "completed" ? "is-complete" : ""}`} key={`${item.taskId}-${index}`}>
            <span className="timeline-dot" /><span className="timeline-index">{String(index + 1).padStart(2, "0")}</span>
            <div className="timeline-task"><b>{item.title}</b><small>{task.goalId ? goals.find((goal) => goal.id === task.goalId)?.title ?? "Maqsad" : "Shaxsiy vazifa"}</small></div>
            <span className={`timeline-priority ${task.importance >= 4 ? "priority-high" : task.importance <= 2 ? "priority-low" : ""}`}>{task.importance >= 4 ? "Yuqori" : task.importance <= 2 ? "Past" : "O'rta"}</span>
            <span className="timeline-duration"><Clock3 size={13} /> {item.minutes} daq.</span>
            <button className={`timeline-check ${task.status === "completed" ? "checked" : ""}`} aria-label={task.status === "completed" ? "Qayta ochish" : "Bajarildi deb belgilash"} onClick={() => void onToggleTask(task)}>{task.status === "completed" && <Check size={13} />}</button>
            <span className="timeline-status">{task.status === "completed" ? "Bajarildi" : "Bajarilishi kerak"}</span>
          </div>;
        }) : <div className="planner-empty-day"><CalendarDays size={23} /><b>Bugungi reja hali bo'sh</b><span>Vazifa qo'shing — kunlik rejangiz vaqtingizga mos tuziladi.</span><button className="text-link" onClick={() => setForm("task")}>Vazifa qo'shish <ArrowRight size={13} /></button></div>}</div>
        {plan.deferred.length > 0 && <p className="planner-deferred">{plan.deferred.length} ta vazifa bugungi bo'sh vaqtdan oshgani uchun keyinga qoldi.</p>}
        <div className="planner-today-footer"><span>{plan.plannedMinutes} / {plan.availableMinutes} daqiqa band</span><button className="text-link" onClick={() => setForm("task")}>Barcha vazifalar <ArrowRight size={13} /></button></div>
      </section>
      <section className="planner-list-panel"><div className="section-heading"><div><span className="eyebrow">VAZIFALAR</span><h2>Faol ishlar</h2></div><div className="segmented">{(["todo", "completed", "all"] as const).map((key) => <button className={filter === key ? "selected" : ""} key={key} onClick={() => setFilter(key)}>{key === "todo" ? "Faol" : key === "completed" ? "Bajarilgan" : "Barchasi"}</button>)}</div></div>
      {form === "task" && <form className="inline-form" onSubmit={submitTask}><div className="form-header"><b>Yangi vazifa</b><button className="icon-button" type="button" onClick={() => setForm(null)} aria-label="Yopish"><X size={17} /></button></div><label>Vazifa nomi<input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} required maxLength={140} placeholder="Masalan, 2-bobni takrorlash" /></label><div className="form-two"><label>Maqsad<select value={taskGoal} onChange={(event) => setTaskGoal(event.target.value)}><option value="">Bog'lanmagan</option>{goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></label><label>Muddati<input type="date" value={taskDate} onChange={(event) => setTaskDate(event.target.value)} /></label></div><div className="form-two"><label>Davomiyligi <span className="optional">daqiqada</span><input type="number" min="1" max="1440" value={taskMinutes} onChange={(event) => setTaskMinutes(Number(event.target.value))} required /></label><label>Muhimlik <span className="optional">1–5</span><select value={importance} onChange={(event) => setImportance(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((item) => <option key={item} value={item}>{item} / 5</option>)}</select></label></div>{error && <p className="form-error">{error}</p>}<button className="button button-navy" disabled={saving}>{saving ? "Saqlanmoqda..." : "Vazifani saqlash"}<ArrowRight size={15} /></button></form>}
      {form === "goal" && <form className="inline-form" onSubmit={submitGoal}><div className="form-header"><b>Yangi maqsad</b><button className="icon-button" type="button" onClick={() => setForm(null)} aria-label="Yopish"><X size={17} /></button></div><label>Maqsad nomi<input value={goalTitle} onChange={(event) => setGoalTitle(event.target.value)} required maxLength={140} placeholder="Masalan, IELTS 7.0 olish" /></label><div className="form-two"><label>Yo'nalish<select value={goalCategory} onChange={(event) => setGoalCategory(event.target.value)}><option>O'qish</option><option>Til</option><option>Kasbiy rivojlanish</option><option>Shaxsiy rivojlanish</option></select></label><label>Maqsad muddati<input type="date" value={goalDate} onChange={(event) => setGoalDate(event.target.value)} /></label></div>{error && <p className="form-error">{error}</p>}<button className="button button-navy" disabled={saving}>{saving ? "Saqlanmoqda..." : "Maqsadni saqlash"}<ArrowRight size={15} /></button></form>}
      {editingTask && <form className="inline-form" onSubmit={submitTaskEdit}><div className="form-header"><b>Vazifani tahrirlash</b><button className="icon-button" type="button" onClick={() => setEditingTask(null)} aria-label="Yopish"><X size={17} /></button></div><label>Vazifa nomi<input value={editValues.title} onChange={(event) => setEditValues((current) => ({ ...current, title: event.target.value }))} required maxLength={140} /></label><div className="form-two"><label>Maqsad<select value={editValues.goalId} onChange={(event) => setEditValues((current) => ({ ...current, goalId: event.target.value }))}><option value="">Bog'lanmagan</option>{goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></label><label>Muddati<input type="date" value={editValues.dueAt} onChange={(event) => setEditValues((current) => ({ ...current, dueAt: event.target.value }))} /></label></div><div className="form-two"><label>Davomiyligi<input type="number" min="1" max="1440" value={editValues.estimatedMinutes} onChange={(event) => setEditValues((current) => ({ ...current, estimatedMinutes: Number(event.target.value) }))} /></label><label>Muhimlik<select value={editValues.importance} onChange={(event) => setEditValues((current) => ({ ...current, importance: Number(event.target.value) }))}>{[1, 2, 3, 4, 5].map((item) => <option key={item} value={item}>{item} / 5</option>)}</select></label></div>{error && <p className="form-error">{error}</p>}<button className="button button-navy" disabled={saving}>{saving ? "Saqlanmoqda..." : "O'zgarishlarni saqlash"}<Check size={15} /></button></form>}
      <div className="task-list">{visibleTasks.length ? visibleTasks.map((task) => {
        const score = plan.scheduled.find((item) => item.taskId === task.id)?.priorityScore;
        return <div className={`task-row ${task.status === "completed" ? "task-completed" : ""}`} key={task.id}><button className={`task-toggle ${task.status === "completed" ? "checked" : ""}`} onClick={() => onToggleTask(task)} aria-label={task.status === "completed" ? "Qayta ochish" : "Bajarildi deb belgilash"}>{task.status === "completed" && <Check size={14} />}</button><div className="task-row-content"><b>{task.title}</b><div className="task-subline"><span><Clock3 size={12} /> {task.estimatedMinutes} daq.</span>{task.dueAt && <span><CalendarDays size={12} /> {task.dueAt.toDate().toLocaleDateString("uz-UZ", { day: "numeric", month: "short" })}</span>}<span>Muhimlik {task.importance}/5</span>{task.goalId && <span>{goals.find((goal) => goal.id === task.goalId)?.title}</span>}</div></div>{score && <span className="priority-pill">Skor {score}</span>}<button className="icon-button delete-button" title="Tahrirlash" aria-label={`${task.title} vazifasini tahrirlash`} onClick={() => startTaskEdit(task)}><Pencil size={14} /></button><button className="icon-button delete-button" title="Vazifani o'chirish" aria-label={`${task.title} vazifasini o'chirish`} onClick={() => onRemoveTask(task.id)}><Trash2 size={15} /></button></div>;
      }) : <div className="list-empty"><BookOpen size={20} /><b>{filter === "completed" ? "Bajarilgan vazifa yo'q" : "Bu ro'yxat hozircha bo'sh"}</b><span>Vazifa yarating; ustuvorlik hisobi muddat va muhimlikni e'tiborga oladi.</span></div>}</div>
    </section></div><aside className="goal-list-panel"><div className="section-heading"><div><span className="eyebrow">YO'NALISH</span><h2>Maqsadlar</h2></div><button className="icon-button" aria-label="Maqsad qo'shish" onClick={() => setForm("goal")}><Plus size={18} /></button></div>{editingGoal && <form className="inline-form" onSubmit={submitGoalEdit}><div className="form-header"><b>Maqsadni tahrirlash</b><button className="icon-button" type="button" onClick={() => setEditingGoal(null)} aria-label="Yopish"><X size={17} /></button></div><label>Nomi<input value={goalEditValues.title} onChange={(event) => setGoalEditValues((current) => ({ ...current, title: event.target.value }))} required maxLength={140} /></label><label>Yo'nalish<select value={goalEditValues.category} onChange={(event) => setGoalEditValues((current) => ({ ...current, category: event.target.value }))}><option>O'qish</option><option>Til</option><option>Kasbiy rivojlanish</option><option>Shaxsiy rivojlanish</option></select></label><label>Muddati<input type="date" value={goalEditValues.targetDate} onChange={(event) => setGoalEditValues((current) => ({ ...current, targetDate: event.target.value }))} /></label><label>Holati<select value={goalEditValues.status} onChange={(event) => setGoalEditValues((current) => ({ ...current, status: event.target.value as Goal["status"] }))}><option value="active">Faol</option><option value="paused">Pauza</option><option value="completed">Bajarildi</option></select></label>{error && <p className="form-error">{error}</p>}<button className="button button-navy" disabled={saving}>{saving ? "Saqlanmoqda..." : "O'zgarishlarni saqlash"}<Check size={15} /></button></form>}{goals.length ? goals.map((goal) => <div className="goal-list-item" key={goal.id}><span className={`goal-state ${goal.status}`} /><div><b>{goal.title}</b><small>{goal.category}{goal.targetDate ? ` · ${goal.targetDate.toDate().toLocaleDateString("uz-UZ")}` : ""}</small><span className="goal-progress-track"><i style={{ width: `${goalProgress(goal.id)}%` }} /></span></div><span className="goal-task-count">{tasks.filter((task) => task.goalId === goal.id && task.status === "completed").length}/{tasks.filter((task) => task.goalId === goal.id).length}</span><button className="icon-button delete-button" aria-label={`${goal.title} maqsadini tahrirlash`} onClick={() => startGoalEdit(goal)}><Pencil size={14} /></button><button className="icon-button delete-button" aria-label={`${goal.title} maqsadini o'chirish`} onClick={() => onRemoveGoal(goal.id)}><Trash2 size={14} /></button></div>) : <div className="list-empty"><Target size={20} /><b>Birinchi maqsadni qo'shing</b><span>Maqsadga bog'langan vazifalar rejangizda yuqoriroq turadi.</span><button className="text-link" onClick={() => setForm("goal")}>Maqsad yaratish <ArrowRight size={14} /></button></div>}<div className="planner-advice"><Sparkles size={16} /><div><b>AI tavsiyasi</b><p>{plan.deferred.length ? `${plan.deferred.length} ta vazifani keyingi kunga qoldirib, bugungi muhim ishlarni tugatishga e'tibor qarating.` : "Bugungi bo'sh vaqtingizni eng muhim vazifalardan boshlang. Reja vaqt chegarangizga moslangan."}</p></div></div><div className="scoring-note"><CircleHelp size={15} /><p>Ustuvorlik muddati, muhimlik va maqsadga aloqadorlikka qarab tuziladi.</p></div></aside>
    </div>
    <section className="planner-weekly-panel"><div className="planner-weekly-heading"><div><span className="eyebrow">IZCHILLIK NATIJA BERADI</span><h2>Haftalik ritm</h2></div><div><button className="icon-button" aria-label="Oldingi hafta" onClick={() => setWeekOffset((offset) => offset - 1)}><ChevronLeft size={17} /></button><span>{new Intl.DateTimeFormat("uz-UZ", { day: "numeric", month: "short" }).format(weekDays[0])} — {new Intl.DateTimeFormat("uz-UZ", { day: "numeric", month: "short" }).format(weekDays[6])}</span><button className="icon-button" aria-label="Keyingi hafta" onClick={() => setWeekOffset((offset) => offset + 1)}><ChevronRight size={17} /></button></div></div>
      <div className="planner-week-grid">{weekDays.map((date) => {
        const dayTasks = tasks.filter((task) => task.dueAt?.toDate().toDateString() === date.toDateString());
        const completed = dayTasks.filter((task) => task.status === "completed").length;
        return <div className={`planner-week-day ${date.toDateString() === new Date().toDateString() ? "is-today" : ""}`} key={date.toISOString()}>
          <small>{new Intl.DateTimeFormat("uz-UZ", { weekday: "short" }).format(date)}</small><b>{date.getDate()}</b>
          <div className="week-activity-dots">{dayTasks.slice(0, 4).map((task) => <i className={task.status === "completed" ? "done" : ""} key={task.id} title={task.title} />)}</div>
          <span>{dayTasks.length ? `${completed}/${dayTasks.length} vazifa` : "Reja yo'q"}</span>
        </div>;
      })}</div>
    </section>
  </>;
}

function Mentor({ user, profile, goals, tasks, focusMinutes }: { user: User; profile: StudentProfile; goals: Goal[]; tasks: StudyTask[]; focusMinutes: number }) {
  const [action, setAction] = useState<"plan" | "prioritize" | "behind">("plan");
  const [messages, setMessages] = useState<MentorMessage[]>([]);
  const conversationRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastRequest, setLastRequest] = useState<{ text: string; action?: "plan" | "prioritize" | "behind" } | null>(null);

  useEffect(() => {
    conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, error]);

  async function sendMessage(text: string, nextAction?: "plan" | "prioritize" | "behind", retry = false) {
    const message = text.trim();
    if (!message || loading) return;
    const previousMessages = retry ? messages.slice(0, -1) : messages;
    if (!retry) setMessages((current) => [...current, { role: "user", text: message }]);
    if (nextAction) setAction(nextAction);
    setLastRequest({ text: message, action: nextAction });
    setLoading(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/mentor", {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          ...(nextAction ? { action: nextAction } : { message }),
          history: previousMessages.slice(-10),
          goal: goals.map((goal) => goal.title).join(", ").slice(0, 300), availableMinutes: profile.dailyAvailableMinutes,
          tasks: tasks.slice(0, 30).map((task) => ({
            title: task.title, estimatedMinutes: task.estimatedMinutes, importance: task.importance,
            status: task.status, dueLabel: task.dueAt?.toDate().toLocaleDateString("uz-UZ"),
          })),
          completedRecently: tasks.filter((task) => task.status === "completed").length,
          focusMinutesRecently: focusMinutes,
        }),
      });
      const result = await response.json() as { answer?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Mentor javob bermadi.");
      setMessages((current) => [...current, { role: "model", text: result.answer ?? "" }]);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Mentor xizmatida xatolik.");
    } finally { setLoading(false); }
  }

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message) return;
    setDraft("");
    void sendMessage(message);
  }
  return <>
    <div className="page-title-row mentor-page-title"><div className="mentor-title-copy"><span className="mentor-title-icon"><BrainCircuit size={21} /></span><div><span className="eyebrow">SIZNING SHAXSIY RIVOJLANISH HAMROHINGIZ</span><h1>AI Mentor<span>.</span></h1><p>Rejalaringizni birga aniqlashtiring va keyingi qadamingizni toping.</p></div></div><span className="ai-status"><span /> AI tayyor</span></div>
    <div className="mentor-layout"><section className="mentor-chat"><div className="mentor-chat-heading"><span className="mentor-mark"><Sparkles size={16} /></span><div><b>FaDiMuss Mentor</b><small>Shaxsiy rivojlanish hamrohi</small></div><span className="today-date">KONTEKST CHEKLANGAN</span></div>
      <div className="mentor-conversation" ref={conversationRef} role="log" aria-live="polite">
        {!messages.length && <div className="mentor-message"><span className="mentor-mark"><Sparkles size={14} /></span><div><b>Salom, {profile.displayName?.split(" ")[0]}.</b><p>Bugungi maqsadingizga qaysi tomondan yondashamiz? Savolingizni yozing yoki tezkor savollardan birini tanlang.</p></div></div>}
        {messages.map((message, index) => <div className={`mentor-message ${message.role === "user" ? "mentor-message-user" : ""}`} key={`${message.role}-${index}`}>
          {message.role === "model" && <span className="mentor-mark"><Sparkles size={14} /></span>}
          <div className="mentor-message-bubble"><b>{message.role === "user" ? "Siz" : "FaDiMuss Mentor"}</b>{formatMentorAnswer(message.text)}</div>
        </div>)}
        {loading && <div className="mentor-thinking"><span className="loader" /> Kontekst tahlil qilinmoqda...</div>}
        {error && <div className="mentor-error" role="alert"><CircleHelp size={17} /><div><b>Javob olinmadi</b><p>{error}</p></div>{lastRequest && <button className="button button-outline" onClick={() => void sendMessage(lastRequest.text, lastRequest.action, true)}>Qayta urinish</button>}</div>}
      </div>
      <form className="mentor-composer" onSubmit={submitMessage}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Mentorga savolingizni yozing..." maxLength={2000} rows={2} aria-label="Mentorga xabar" disabled={loading} /><button className="button button-navy" type="submit" disabled={loading || !draft.trim()}><Send size={15} /> Yuborish</button></form>
      <div className="mentor-prompts"><span className="eyebrow">TEZKOR SAVOLLAR</span><div><button disabled={loading} className={action === "plan" ? "prompt-selected" : ""} onClick={() => void sendMessage("Bugungi rejamni tuzib ber.", "plan")}><CalendarDays size={15} /> Bugungi rejamni tuz</button><button disabled={loading} className={action === "prioritize" ? "prompt-selected" : ""} onClick={() => void sendMessage("Vazifalarimni ustuvorligi bo'yicha tartiblab ber.", "prioritize")}><ArrowUpRight size={15} /> Vazifalarimni ustuvorlashtir</button><button disabled={loading} className={action === "behind" ? "prompt-selected" : ""} onClick={() => void sendMessage("Nega rejamdan ortda qolayotgan bo'lishim mumkin?", "behind")}><CircleHelp size={15} /> Nega ortda qolyapman?</button></div></div>
    </section><aside className="mentor-context"><span className="eyebrow">YUBORILADIGAN KONTEKST</span><h3>Faqat kerakli ma'lumot.</h3><p>Mentor xabariga emailingiz, ism-familiyangiz yoki boshqa shaxsiy profil maydonlari qo'shilmaydi.</p><div className="context-row"><CalendarDays size={16} /><span><b>{profile.dailyAvailableMinutes} daqiqa</b><small>kunlik ajratilgan vaqt</small></span></div><div className="context-row"><BookOpen size={16} /><span><b>{tasks.filter((task) => task.status === "todo").length} faol vazifa</b><small>muddati va muhimligi bilan</small></span></div><div className="context-row"><Focus size={16} /><span><b>{focusMinutes} daqiqa</b><small>bugungi fokus vaqti</small></span></div><div className="mentor-safety"><CircleHelp size={15} /><span>AI tavsiyasi reja o'rnini bosmaydi. Yetarli ma'lumot bo'lmasa, javobda bu aytiladi.</span></div></aside></div>
  </>;
}

type ActiveSession = { id: string; plannedMinutes: number; sessionType: "focus" | "break"; startedAt: Timestamp };

function FocusPage({ user, sessions, onSessionFinished }: { user: User; sessions: FocusSession[]; onSessionFinished: () => Promise<void> }) {
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<"focus" | "break">("focus");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      if (!db) { setLoaded(true); return; }
      try {
        const active = await getDoc(doc(db, "activeFocus", user.uid));
        const sessionId = active.data()?.sessionId as string | undefined;
        if (sessionId) {
          const stored = await getDoc(doc(db, "focusSessions", sessionId));
          if (!cancelled && stored.exists()) setSession({ id: stored.id, ...stored.data() } as ActiveSession);
        }
      } catch { if (!cancelled) setNotice("Faol sessiyani tiklab bo'lmadi."); }
      if (!cancelled) setLoaded(true);
    }
    void restore();
    return () => { cancelled = true; };
  }, [user.uid]);

  const secondsLeft = session ? Math.max(0, session.plannedMinutes * 60 - Math.floor((now - session.startedAt.toMillis()) / 1000)) : (mode === "focus" ? 25 : 5) * 60;
  const percentage = session ? Math.max(0, Math.min(100, 100 - secondsLeft / (session.plannedMinutes * 60) * 100)) : 0;

  async function start() {
    setBusy(true); setNotice("");
    const timeout = window.setTimeout(() => {
      setBusy(false);
      setNotice("Fokus serveri 20 soniyada javob bermadi. Internet yoki Firebase Admin sozlamalarini tekshiring.");
    }, 20_000);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/focus/start", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ sessionType: mode }) });
      const result = await response.json() as {
        sessionId?: string;
        sessionType?: ActiveSession["sessionType"];
        plannedMinutes?: number;
        startedAt?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "Sessiya boshlanmadi.");
      if (!result.sessionId || !result.sessionType || !result.plannedMinutes || !result.startedAt) {
        throw new Error("Server sessiya ma'lumotlarini to'liq qaytarmadi. Qayta urinib ko'ring.");
      }
      setSession({
        id: result.sessionId,
        sessionType: result.sessionType,
        plannedMinutes: result.plannedMinutes,
        startedAt: Timestamp.fromMillis(result.startedAt),
      });
    } catch (error) { setNotice(error instanceof Error ? error.message : "Sessiya boshlanmadi."); }
    finally { window.clearTimeout(timeout); setBusy(false); }
  }

  async function finish() {
    if (!session || busy) return;
    setBusy(true); setNotice("");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/focus/finish", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ sessionId: session.id }) });
      const result = await response.json() as { pointsAwarded?: number; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Sessiya yakunlanmadi.");
      setNotice(result.pointsAwarded ? `Sessiya yakunlandi. +${result.pointsAwarded} XP` : "Sessiya yakunlandi.");
      setSession(null); await onSessionFinished();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Sessiyani yakunlab bo'lmadi."); }
    finally { setBusy(false); }
  }

  const finishWhenElapsed = useEffectEvent(() => { void finish(); });

  useEffect(() => {
    if (!session || secondsLeft !== 0 || busy) return;
    const timeout = window.setTimeout(finishWhenElapsed, 0);
    return () => window.clearTimeout(timeout);
  }, [session, secondsLeft, busy]);

  const history = [...sessions].sort((a, b) => (b.startedAt?.toMillis() ?? 0) - (a.startedAt?.toMillis() ?? 0)).slice(0, 6);
  return <>
    <div className="page-title-row"><div><span className="eyebrow">BIR VAZIFA. TO'LIQ DIQQAT.</span><h1>Fokus vaqti.</h1><p>25 daqiqa e'tibor, 5 daqiqa tanaffus. XP faqat server tasdiqlagan sessiyaga beriladi.</p></div><span className="focus-rule"><Award size={15} /> 25 daqiqa fokus = 5 XP · kuniga ko'pi bilan 40 XP</span></div>
    <div className="focus-layout"><section className={`focus-main ${session ? "focus-session-active" : ""}`}><div className="focus-mode-tabs"><button className={mode === "focus" ? "selected" : ""} disabled={!!session} onClick={() => setMode("focus")}><Focus size={15} /> Fokus <small>25:00</small></button><button className={mode === "break" ? "selected" : ""} disabled={!!session} onClick={() => setMode("break")}><Clock3 size={15} /> Tanaffus <small>05:00</small></button></div><div className="timer-area"><svg className="timer-ring" viewBox="0 0 240 240" aria-label={`${Math.floor(secondsLeft / 60)} daqiqa ${secondsLeft % 60} soniya qoldi`}><circle className="timer-track" cx="120" cy="120" r="105" /><circle className="timer-progress" cx="120" cy="120" r="105" style={{ strokeDashoffset: 660 - (percentage / 100 * 660) }} /></svg><div className="timer-content"><span>{session ? session.sessionType === "focus" ? "DIQQAT SESSIYASI" : "QISQA TANAFFUS" : mode === "focus" ? "DIQQAT UCHUN VAQT" : "NAFAS ROSTLANG"}</span><b>{String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:{String(secondsLeft % 60).padStart(2, "0")}</b><small>{session ? "Sahifa yangilansa taymer davom etadi" : "Bitta vazifaga e'tibor bering"}</small></div></div>{notice && <p className="focus-notice" role="status">{notice}</p>}{loaded && <div className="focus-controls">{session ? <button className="button button-navy" disabled={busy || secondsLeft > 0} onClick={() => void finish()}>{busy ? "Tekshirilmoqda..." : secondsLeft > 0 ? "Vaqt tugashini kuting" : "Sessiyani yakunlash"}<Check size={16} /></button> : <button className="button button-navy" disabled={busy} onClick={() => void start()}>{busy ? "Boshlanmoqda..." : `${mode === "focus" ? "Fokusni" : "Tanaffusni"} boshlash`}<ArrowRight size={16} /></button>}</div>}<p className="timer-caption">Sessiya boshlanishi va tugashi serverda tekshiriladi. Oyna yangilansa, faol taymer tiklanadi.</p></section>
      <aside className="focus-side"><span className="eyebrow">SESSIYA TARIXI</span><h2>So'nggi diqqat vaqti.</h2>{history.length ? <div className="session-history">{history.map((item) => <div key={item.id}><span className={`history-type ${item.sessionType}`}><Focus size={14} /></span><div><b>{item.sessionType === "focus" ? "Fokus sessiyasi" : "Tanaffus"}</b><small>{item.startedAt?.toDate().toLocaleDateString("uz-UZ", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small></div><span className="history-duration">{item.actualMinutes} daq.</span>{item.pointsAwarded > 0 && <span className="history-xp">+{item.pointsAwarded} XP</span>}</div>)}</div> : <div className="list-empty"><Clock3 size={20} /><b>Hali sessiya yo'q</b><span>Birinchi fokus vaqtingiz boshlanishi bilan tarix shu yerda ko'rinadi.</span></div>}<div className="focus-reminder"><Flame size={16} /><span>Kichik, muntazam sessiyalar izchillikni qo'llab-quvvatlaydi. Dam olish ham rejaning bir qismi.</span></div></aside></div>
  </>;
}

function Talent({ user }: { user: User }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [scores, setScores] = useState<Record<string, number> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      if (!db) { setLoading(false); return; }
      try {
        const snapshot = await getDocs(query(collection(db, "talentAssessments"), where("userId", "==", user.uid)));
        if (!snapshot.empty) {
          const latest = snapshot.docs.sort((a, b) => (b.data().createdAt?.toMillis?.() ?? 0) - (a.data().createdAt?.toMillis?.() ?? 0))[0].data();
          setAnswers(latest.answers ?? {}); setScores(latest.categoryScores ?? null);
        }
      } catch { setError("Avvalgi natijani yuklab bo'lmadi."); }
      setLoading(false);
    }
    void load();
  }, [user.uid]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      if (!db) throw new Error("Firebase sozlanmagan.");
      const categoryScores = scoreTalentAssessment(answers);
      await addDoc(collection(db, "talentAssessments"), {
        userId: user.uid, answers, categoryScores, scoringVersion: "1.0", createdAt: serverTimestamp(),
      });
      setScores(categoryScores);
    } catch { setError("Natijani saqlab bo'lmadi. Qayta urinib ko'ring."); }
    finally { setSaving(false); }
  }
  const topCategory = scores ? [...talentCategories].sort((a, b) => scores[b] - scores[a])[0] : null;
  return <>
    <div className="page-title-row"><div><span className="eyebrow">O'ZINGIZ HAQIDA KUZATUV</span><h1>Qobiliyatlar xaritasi.</h1><p>Javoblaringizdan hisoblangan taxminiy ko'rsatkichlar, yakuniy hukm emas.</p></div><span className="ai-status"><Compass size={15} /> O'ZINI BAHOLASH</span></div>
    {loading ? <div className="loading-inline"><span className="loader" /> Natija tekshirilmoqda...</div> : scores ? <div className="talent-results"><section className="talent-score-panel"><span className="eyebrow">SIZNING KUCHLI TOMONLARINGIZ</span><h2>Rivojlantirish uchun<br />bir nechta yo'nalish.</h2><p className="score-disclaimer">Bu o'zini baholash asosidagi taxminiy ko'rsatkich; psixologik test yoki kasbga yakuniy hukm emas.</p><div className="score-list">{talentCategories.map((category) => <div className="score-row" key={category}><span>{categoryLabels[category]}</span><div className="score-bar"><i style={{ width: `${scores[category]}%` }} /></div><b>{scores[category]}</b></div>)}</div><button className="button button-outline" onClick={() => setScores(null)}>Javoblarni qayta ko'rish</button></section><aside className="talent-path"><span className="eyebrow">KEYINGI AMALIY QADAM</span><h3>{topCategory ? categoryLabels[topCategory] : "Ko'nikmalaringiz"}ni sinab ko'ring.</h3><p>Ball yuqori chiqqan yo'nalishlarda kichik mashqlar qilib, natijani amalda kuzating.</p><ol><li>Bir haftada 3 marta, har biri 15 daqiqadan mashq qiling.</li><li>Har mashqdan so'ng nima oson va qiyin bo'lganini yozing.</li><li>Bir hafta o'tib javoblarni yangilab, o'zgarishni solishtiring.</li></ol><button className="text-link" onClick={() => setScores(null)}>Baholashni yangilash <ArrowRight size={14} /></button></aside></div> : <form className="talent-form" onSubmit={submit}><div className="talent-form-top"><div><span className="eyebrow">10 TA QISQA BAYONOT</span><h2>Odatdagi holatingizga<br />qanchalik mos?</h2></div><span className="scale-note">1 — kamdan-kam <span>·</span> 5 — deyarli doim</span></div>{talentCategories.map((category) => <section className="question-group" key={category}><h3>{categoryLabels[category]}</h3>{talentQuestions.filter((question) => question.category === category).map((question) => <div className="question-row" key={question.id}><span>{question.text}</span><div className="rating-options" role="radiogroup" aria-label={question.text}>{[1, 2, 3, 4, 5].map((rating) => <label key={rating} className={answers[question.id] === rating ? "rating-selected" : ""}><input type="radio" name={question.id} value={rating} checked={answers[question.id] === rating} onChange={() => setAnswers((current) => ({ ...current, [question.id]: rating }))} required />{rating}</label>)}</div></div>)}</section>)}{error && <p className="form-error">{error}</p>}<button className="button button-navy" disabled={saving || Object.keys(answers).length < talentQuestions.length}>{saving ? "Hisoblanmoqda..." : "Natijamni hisoblash"}<ArrowRight size={16} /></button></form>}
  </>;
}

function SkillSwap({ user, profile, setFlash }: { user: User; profile: StudentProfile; setFlash: (flash: Flash) => void }) {
  const [teach, setTeach] = useState("");
  const [learn, setLearn] = useState("");
  const [languages, setLanguages] = useState("o'zbek");
  const [availability, setAvailability] = useState("Kechki payt");
  const [visible, setVisible] = useState(false);
  const [candidates, setCandidates] = useState<Array<{ profile: SkillProfile; match: NonNullable<ReturnType<typeof matchSkillProfiles>> }>>([]);
  const [incoming, setIncoming] = useState<Array<{ id: string; fromUserId: string; offeredSkill: string; requestedSkill: string; status: string }>>([]);
  const [outgoing, setOutgoing] = useState<Array<{ id: string; toUserId: string; offeredSkill: string; requestedSkill: string; status: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!db) { setLoading(false); return; }
      try {
        const [privateSnapshot, publicSnapshot, receivedSnapshot, sentSnapshot] = await Promise.all([
          getDoc(doc(db, "skillProfiles", user.uid)),
          getDocs(query(collection(db, "publicSkillProfiles"), where("visible", "==", true))),
          getDocs(query(collection(db, "skillSwapRequests"), where("toUserId", "==", user.uid))),
          getDocs(query(collection(db, "skillSwapRequests"), where("fromUserId", "==", user.uid))),
        ]);
        const own = privateSnapshot.data();
        if (own) { setTeach((own.skillsToTeach ?? []).join(", ")); setLearn((own.skillsToLearn ?? []).join(", ")); setLanguages((own.languages ?? []).join(", ")); setAvailability(own.availabilitySummary ?? ""); setVisible(own.visible ?? false); }
        const goalSkills = profile.interests ?? [];
        const found = publicSnapshot.docs.filter((item) => item.id !== user.uid).flatMap((item) => {
          const data = item.data();
          const candidate: SkillProfile = { userId: data.userId, displayName: data.displayName, skillsToTeach: data.skillsToTeach ?? [], skillsToLearn: data.skillsToLearn ?? [], levels: data.levels ?? {}, languages: data.languages ?? [], availabilitySummary: data.availabilitySummary ?? "" };
          const ownProfile: SkillProfile = { userId: user.uid, displayName: profile.displayName, skillsToTeach: own?.skillsToTeach ?? [], skillsToLearn: own?.skillsToLearn ?? [], levels: own?.levels ?? {}, languages: own?.languages ?? [], availabilitySummary: own?.availabilitySummary ?? "" };
          const match = matchSkillProfiles(ownProfile, candidate, goalSkills);
          return match ? [{ profile: candidate, match }] : [];
        }).sort((a, b) => b.match.score - a.match.score);
        if (!cancelled) {
          setCandidates(found);
          setIncoming(receivedSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as typeof incoming[number]));
          setOutgoing(sentSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as typeof outgoing[number]));
        }
      } catch { if (!cancelled) setError("Ko'nikma profillari yuklanmadi. Firestore qoidalarini tekshiring."); }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [user.uid, profile.displayName, profile.interests]);

  function split(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 12); }
  async function saveSkillProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      if (!db) throw new Error("Firebase sozlanmagan.");
      const skillsToTeach = split(teach); const skillsToLearn = split(learn);
      if (!skillsToTeach.length || !skillsToLearn.length) throw new Error("Kamida bitta o'rgatadigan va o'rganadigan ko'nikma kiriting.");
      const data = {
        userId: user.uid, displayName: profile.displayName,
        skillsToTeach, skillsToLearn,
        levels: Object.fromEntries([...skillsToTeach, ...skillsToLearn].map((skill) => [skill, 3])),
        languages: split(languages), availabilitySummary: availability.trim(), visible,
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, "skillProfiles", user.uid), data);
      if (visible) await setDoc(doc(db, "publicSkillProfiles", user.uid), data);
      else await deleteDoc(doc(db, "publicSkillProfiles", user.uid));
      setFlash({ kind: "success", message: visible ? "Profil saqlandi va mos qidiruvda ko'rinadi." : "Shaxsiy ko'nikma profilingiz saqlandi." });
      if (visible) {
        const publicProfiles = await getDocs(query(collection(db, "publicSkillProfiles"), where("visible", "==", true)));
        const ownProfile: SkillProfile = { userId: user.uid, displayName: profile.displayName, skillsToTeach, skillsToLearn, levels: data.levels, languages: data.languages, availabilitySummary: data.availabilitySummary };
        setCandidates(publicProfiles.docs.filter((item) => item.id !== user.uid).flatMap((item) => {
          const candidateData = item.data();
          const candidate: SkillProfile = { userId: candidateData.userId, displayName: candidateData.displayName, skillsToTeach: candidateData.skillsToTeach ?? [], skillsToLearn: candidateData.skillsToLearn ?? [], levels: candidateData.levels ?? {}, languages: candidateData.languages ?? [], availabilitySummary: candidateData.availabilitySummary ?? "" };
          const match = matchSkillProfiles(ownProfile, candidate, profile.interests ?? []);
          return match ? [{ profile: candidate, match }] : [];
        }));
      } else setCandidates([]);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Profil saqlanmadi."); }
    finally { setSaving(false); }
  }
  async function sendRequest(candidate: SkillProfile, match: NonNullable<ReturnType<typeof matchSkillProfiles>>) {
    if (!db) return;
    setError("");
    try {
      await addDoc(collection(db, "skillSwapRequests"), {
        fromUserId: user.uid, toUserId: candidate.userId,
        offeredSkill: match.requestedSkill || split(teach)[0],
        requestedSkill: match.offeredSkill, status: "pending",
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      setFlash({ kind: "success", message: `${candidate.displayName}ga qiziqish so'rovi yuborildi.` });
      const snapshot = await getDocs(query(collection(db, "skillSwapRequests"), where("fromUserId", "==", user.uid)));
      setOutgoing(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as typeof outgoing[number]));
    } catch { setError("So'rov yuborilmadi. Qayta urinib ko'ring."); }
  }
  async function respond(id: string, status: "accepted" | "declined") {
    if (!db) return;
    try { await updateDoc(doc(db, "skillSwapRequests", id), { status, updatedAt: serverTimestamp() }); setIncoming((current) => current.map((item) => item.id === id ? { ...item, status } : item)); }
    catch { setError("So'rov holati yangilanmadi."); }
  }
  const hasSent = (uid: string) => outgoing.some((request) => request.toUserId === uid && request.status === "pending");
  return <>
    <div className="page-title-row"><div><span className="eyebrow">BILIM ULASHISH</span><h1>Ko'nikmalar almashinuvi.</h1><p>O'rgatishingiz va o'rganishingiz mumkin bo'lgan ko'nikmalar orqali moslashing.</p></div><span className="ai-status"><Compass size={15} /> KONTAKTLAR YASHIRIN</span></div>
    <div className="skills-layout"><section className="skill-profile-panel"><div className="section-heading"><div><span className="eyebrow">SIZNING PROFILINGIZ</span><h2>Nimani ulashasiz?</h2></div><BookOpen size={19} /></div><form className="skill-form" onSubmit={saveSkillProfile}><label>O'rgata olaman <span className="optional">vergul bilan</span><input value={teach} onChange={(event) => setTeach(event.target.value)} placeholder="Ingliz tili, Figma" maxLength={240} /></label><label>O'rganmoqchiman <span className="optional">vergul bilan</span><input value={learn} onChange={(event) => setLearn(event.target.value)} placeholder="Grafik dizayn, Excel" maxLength={240} /></label><label>Tillar<input value={languages} onChange={(event) => setLanguages(event.target.value)} placeholder="O'zbek, ingliz" maxLength={120} /></label><label>Qulay vaqt<input value={availability} onChange={(event) => setAvailability(event.target.value)} placeholder="Masalan, hafta ichi kechki payt" maxLength={100} /></label><label className="visibility-toggle"><input type="checkbox" aria-label="Ko'nikma profilini qidiruvda ko'rsatish" checked={visible} onChange={(event) => setVisible(event.target.checked)} /><span><b>Mos qidiruvda ko'rinish</b><small>Faqat ism va ko'nikmalar ko'rinadi. Email va kontaktlar hech qachon ochilmaydi.</small></span></label>{error && <p className="form-error">{error}</p>}<button className="button button-navy" disabled={saving}>{saving ? "Saqlanmoqda..." : "Profilni saqlash"}<ArrowRight size={15} /></button></form></section>
      <section className="skill-matches"><div className="section-heading"><div><span className="eyebrow">SIZ UCHUN MOSLAR</span><h2>O'rganish sheriklari</h2></div><span className="match-count">{candidates.length} profil</span></div>{loading ? <div className="loading-inline"><span className="loader" /> Mos profillar qidirilmoqda...</div> : !visible ? <div className="list-empty"><Compass size={20} /><b>Avval profilingizni ochiq qiling</b><span>Moslik faqat o'rgatish va o'rganish ko'nikmalari qarama-qarshi to'ldirilganda ko'rsatiladi.</span></div> : candidates.length ? candidates.map(({ profile: candidate, match }) => <article className="match-card" key={candidate.userId}><div className="match-top"><span className="avatar">{candidate.displayName.slice(0, 1).toUpperCase()}</span><div><b>{candidate.displayName}</b><small>{match.direction === "two-way" ? "Ikki tomonlama moslik" : "Bir tomonlama moslik"}</small></div><span className="match-score">{match.score}<small>%</small></span></div><div className="match-exchange"><span><small>O'RGANASIZ</small><b>{match.offeredSkill}</b></span><ArrowRight size={16} /><span><small>ULASHASIZ</small><b>{match.requestedSkill || "Yordam taklif qilishingiz mumkin"}</b></span></div><ul>{match.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><button className="button button-outline" disabled={hasSent(candidate.userId)} onClick={() => void sendRequest(candidate, match)}>{hasSent(candidate.userId) ? "So'rov yuborilgan" : "Qiziqish yuborish"}<ArrowRight size={14} /></button></article>) : <div className="list-empty"><Compass size={20} /><b>Hozircha mos profil topilmadi</b><span>Ko'nikmalarni yangilang yoki keyinroq qayta tekshiring.</span></div>}</section></div>
    {(incoming.length > 0 || outgoing.length > 0) && <section className="requests-panel"><span className="eyebrow">SO'ROVLAR</span><h2>Qiziqish holati</h2><div className="request-list">{incoming.map((request) => <div key={request.id}><span><b>Yangi so'rov</b><small>{request.offeredSkill} ↔ {request.requestedSkill}</small></span>{request.status === "pending" ? <div><button className="request-accept" onClick={() => void respond(request.id, "accepted")}>Qabul qilish</button><button className="request-decline" onClick={() => void respond(request.id, "declined")}>Rad etish</button></div> : <span className={`request-status ${request.status}`}>{request.status === "accepted" ? "Qabul qilindi" : "Rad etildi"}</span>}</div>)}{outgoing.map((request) => <div key={request.id}><span><b>Yuborilgan so'rov</b><small>{request.offeredSkill} ↔ {request.requestedSkill}</small></span><span className={`request-status ${request.status}`}>{request.status === "pending" ? "Javob kutilmoqda" : request.status === "accepted" ? "Qabul qilindi" : "Rad etildi"}</span></div>)}</div><p className="privacy-note">MVPda ochiq chat yo'q. So'rov holati bilan tanishing; shaxsiy kontakt ulashilmaydi.</p></section>}
  </>;
}

function Profile({ profile, onSave, onSignOut }: { profile: StudentProfile; onSave: (values: Partial<StudentProfile>) => Promise<void>; onSignOut: () => Promise<void> }) {
  const [name, setName] = useState(profile.displayName ?? "");
  const [education, setEducation] = useState(profile.educationLevel ?? "");
  const [interests, setInterests] = useState((profile.interests ?? []).join(", "));
  const [skills, setSkills] = useState((profile.skills ?? []).join(", "));
  const [minutes, setMinutes] = useState(profile.dailyAvailableMinutes ?? 90);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try { await onSave({ displayName: name.trim(), educationLevel: education || undefined, interests: interests.split(",").map((item) => item.trim()).filter(Boolean), skills: skills.split(",").map((item) => item.trim()).filter(Boolean), dailyAvailableMinutes: minutes, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }); }
    catch { setError("Profil saqlanmadi. Qayta urinib ko'ring."); }
    finally { setSaving(false); }
  }
  const level = levelForXp(profile.xp ?? 0);
  return <>
    <div className="page-title-row"><div><span className="eyebrow">SHAXSIY MA'LUMOTLAR</span><h1>Profil va sozlamalar.</h1><p>Kunlik vaqt va qiziqishlaringiz reja tavsiyalariga ta'sir qiladi.</p></div><span className="profile-level"><Award size={16} /> {level.current}</span></div>
    <div className="profile-layout"><form className="profile-form" onSubmit={submit}><div className="section-heading"><div><span className="eyebrow">ASOSIY MA'LUMOT</span><h2>Profilingiz</h2></div></div><label>Ism<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} /></label><label>Email<input value={profile.email} disabled type="email" /><small className="field-help">Hisob emaili Firebase Authentication orqali boshqariladi.</small></label><label>Ta'lim darajasi<select value={education} onChange={(event) => setEducation(event.target.value)}><option value="">Tanlanmagan</option><option>Maktab</option><option>Bakalavr</option><option>Magistratura</option><option>Boshqa</option></select></label><label>Qiziqishlar<input value={interests} onChange={(event) => setInterests(event.target.value)} maxLength={240} placeholder="Vergul bilan ajrating" /></label><label>Ko'nikmalar<input value={skills} onChange={(event) => setSkills(event.target.value)} maxLength={240} placeholder="Vergul bilan ajrating" /></label><label>Kunlik bo'sh vaqt <b className="minutes-value">{minutes} daqiqa</b><input className="range-input" type="range" min="25" max="360" step="5" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} /></label>{error && <p className="form-error">{error}</p>}<button className="button button-navy" disabled={saving}>{saving ? "Saqlanmoqda..." : "O'zgarishlarni saqlash"}<Check size={16} /></button></form><aside className="profile-side"><div className="profile-avatar">{profile.displayName?.slice(0, 1).toUpperCase()}</div><h3>{profile.displayName}</h3><p>{profile.email}</p><div className="profile-stats"><div><b>{profile.xp ?? 0}</b><small>jami XP</small></div><div><b>{profile.streak ?? 0}</b><small>kunlik streak</small></div><div><b>{level.remaining}</b><small>keyingi darajagacha</small></div></div><div className="profile-levels"><span className="eyebrow">DARAJA QOIDALARI</span>{[{ name: "Beginner", xp: "0 XP" }, { name: "Learner", xp: "100 XP" }, { name: "Achiever", xp: "350 XP" }, { name: "Expert", xp: "800 XP" }, { name: "FaDiMuss", xp: "1,600 XP" }].map((item) => <div key={item.name}><span>{item.name}</span><small>{item.xp}</small></div>)}<p>Vazifa +10 XP. 25 daqiqalik fokus +5 XP, kuniga 40 XP gacha. Kunlik rejaning asosiy qismini bajarish +15 XP.</p></div><button className="button button-outline signout-button" onClick={onSignOut}><LogOut size={15} /> Hisobdan chiqish</button></aside></div>
  </>;
}