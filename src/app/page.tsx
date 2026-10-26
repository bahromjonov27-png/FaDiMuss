"use client";

import { useEffect, useState, type FormEvent } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import { ArrowRight, BookOpen, BrainCircuit, CalendarDays, Check, Clock3, Compass, Focus, ShieldCheck, Sparkles } from "lucide-react";
import { firebaseConfigured, auth, db } from "@/lib/firebase/client";
import type { StudentProfile } from "@/lib/models";
import Workspace from "@/components/Workspace";

const friendlyAuthErrors: Record<string, string> = {
  "auth/email-already-in-use": "Bu email bilan hisob mavjud. Kirishni tanlang.",
  "auth/invalid-credential": "Email yoki parol noto'g'ri.",
  "auth/invalid-login-credentials": "Email yoki parol noto'g'ri. Email bilan parolni tekshiring.",
  "auth/user-not-found": "Bu email bilan hisob topilmadi. Avval ro'yxatdan o'ting.",
  "auth/wrong-password": "Parol noto'g'ri. Qayta tekshirib ko'ring.",
  "auth/weak-password": "Parol kamida 6 belgidan iborat bo'lsin.",
  "auth/invalid-email": "Email manzili to'g'ri ko'rinmayapti.",
  "auth/too-many-requests": "Urinishlar ko'p bo'ldi. Birozdan keyin qayta urinib ko'ring.",
  "auth/operation-not-allowed": "Firebase Console'da Email/Password kirish usulini yoqing.",
  "auth/network-request-failed": "Firebase serveriga ulanish muvaffaqiyatsiz. Internet, VPN yoki adblockni tekshiring. fadimuss.uz’da bo'lsa, deploydagi NEXT_PUBLIC_FIREBASE_* sozlamalari va Firebase Authentication ruxsat etilgan domenlarini tekshiring.",
  "auth/unauthorized-domain": "Bu sayt manzili Firebase Authentication'da ruxsat etilmagan.",
  "permission-denied": "Firestore yozishga ruxsat bermadi. firestore.rules faylini Firebase loyihasiga deploy qiling.",
  "firestore/permission-denied": "Firestore yozishga ruxsat bermadi. firestore.rules faylini Firebase loyihasiga deploy qiling.",
  "unavailable": "Firestore xizmatiga ulanib bo'lmadi. Internet yoki Firebase holatini tekshiring.",
  "unauthenticated": "Firebase hisob sessiyasi tugagan. Qayta kirib ko'ring.",
  "not-found": "Firestore bazasi topilmadi. Firebase Console'da Firestore Database yarating.",
};

function authErrorMessage(error: unknown) {
  const errorObject = typeof error === "object" && error !== null ? error : null;
  const code = errorObject && "code" in errorObject ? String(errorObject.code) : "";
  return friendlyAuthErrors[code] ?? (code
    ? `Firebase xatoligi (${code}). Firebase sozlamalarini tekshiring.`
    : errorObject && "message" in errorObject && typeof errorObject.message === "string"
      ? `Xatolik: ${errorObject.message}`
      : "Xatolik tafsilotlari olinmadi. Sahifani yangilab, qayta urinib ko'ring.");
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(() => Boolean(auth && db));
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!auth || !db) return;
    const firestore = db;
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (!nextUser) { setProfile(null); setLoading(false); return; }
      try {
        const userRef = doc(firestore, "users", nextUser.uid);
        const snapshot = await getDoc(userRef);
        if (snapshot.exists()) {
          setProfile(snapshot.data() as StudentProfile);
        } else {
          const initialProfile: StudentProfile = {
            uid: nextUser.uid,
            displayName: nextUser.displayName ?? nextUser.email?.split("@")[0] ?? "Talaba",
            email: nextUser.email ?? "",
            interests: [],
            skills: [],
            dailyAvailableMinutes: 90,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            onboardingCompleted: false,
            xp: 0,
            streak: 0,
          };
          await setDoc(userRef, {
            ...initialProfile,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          setProfile(initialProfile);
        }
      } catch (error) {
        setAuthError(authErrorMessage(error));
      }
      setLoading(false);
    });
  }, []);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth || !db) return;
    setSubmitting(true);
    setAuthError("");
    try {
      if (authMode === "signup") {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (error) {
      setAuthError(authErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function completeOnboarding(values: Partial<StudentProfile> & { primaryGoal: string }) {
    if (!user || !db) return;
    const { primaryGoal, ...profileValues } = values;
    const userRef = doc(db, "users", user.uid);
    const userSnapshot = await getDoc(userRef);
    const batch = writeBatch(db);
    batch.set(doc(db, "goals", crypto.randomUUID()), {
      userId: user.uid, title: primaryGoal, description: "",
      category: "shaxsiy rivojlanish", status: "active",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    batch.set(userRef, {
      ...profileValues,
      ...(userSnapshot.exists() ? {} : { xp: 0, streak: 0 }),
      uid: user.uid, email: user.email,
      onboardingCompleted: true, updatedAt: serverTimestamp(),
    }, { merge: true });
    await batch.commit();
    setProfile((current) => ({ ...current!, ...profileValues, onboardingCompleted: true }));
  }

  if (loading) return <main className="loading-screen"><span className="loader" /> Yuklanmoqda</main>;
  if (user && profile?.onboardingCompleted) {
    return <Workspace user={user} profile={profile} onProfileChange={setProfile} onSignOut={async () => { if (auth) await signOut(auth); }} />;
  }
  if (user) return <Onboarding user={user} onSubmit={completeOnboarding} initialError={authError} />;

  return (
    <main className="landing-shell">
      <header className="landing-header">
        <a href="#top" className="brand"><span className="brand-mark">F</span><span>FaDiMuss<small>O'QISH VA RIVOJLANISH</small></span></a>
        <div className="header-links"><a href="#imkoniyatlar">Imkoniyatlar</a><a href="#kirish">Kirish</a></div>
      </header>
      <section className="hero" id="top">
        <div className="hero-copy">
          <span className="eyebrow"><span className="eyebrow-line" /> TALABA UCHUN SHAXSIY YO'L</span>
          <h1>O'sishingiz<br />uchun <em>aniq</em><br />yo'nalish.</h1>
          <p>O'qish, maqsad va kundalik vaqtingiz bir joyda. FaDiMuss bugungi muhim qadamni topishga yordam beradi.</p>
          <a href="#kirish" className="button button-gold">Yo'limni boshlash <ArrowRight size={17} /></a>
          <div className="hero-proof"><span><Check size={14} /> Shaxsiy reja</span><span><Check size={14} /> Haqiqiy progress</span></div>
        </div>
        <div className="hero-visual" aria-label="Bugungi o'qish rejasining ko'rinishi">
          <div className="visual-orbit" />
          <div className="visual-card">
            <div className="visual-card-top"><span>REJA NAMUNASI</span><span className="live-dot" /></div>
            <div className="visual-greeting">Bugun kichik qadam,<br /><i>ertaga katta o'zgarish.</i></div>
            <div className="visual-rule" />
            <div className="visual-task"><span className="task-number">01</span><div><b>Ingliz tili: 20 ta so'z</b><small><Clock3 size={12} /> 25 daqiqa</small></div><span className="task-check"><Check size={14} /></span></div>
            <div className="visual-task"><span className="task-number">02</span><div><b>Portfolio loyihasi</b><small><Clock3 size={12} /> 40 daqiqa</small></div><span className="task-check task-check-empty" /></div>
            <div className="visual-progress"><div><span>HAFTALIK MAQSAD</span><b>3 / 5 kun</b></div><div className="progress-track"><i /></div></div>
          </div>
          <div className="visual-stamp"><Sparkles size={15} /><span>BUGUNGI<br />REJA</span></div>
        </div>
      </section>
      <section className="feature-strip" id="imkoniyatlar">
        <div className="feature-intro"><span className="eyebrow">BIR PROFIL. BUTUN YO'L.</span><h2>Rivojlanish<br />tartibli bo'lsin.</h2></div>
        <article><BrainCircuit /><span>01 / YO'NALISH</span><h3>AI Mentor</h3><p>Maqsadingiz va real progressga tayangan amaliy maslahat.</p></article>
        <article><CalendarDays /><span>02 / REJA</span><h3>Smart Planner</h3><p>Bo'sh vaqtingizga mos, ustuvor kunlik vazifalar.</p></article>
        <article><Focus /><span>03 / DIQQAT</span><h3>Focus Mode</h3><p>25 daqiqalik sessiyalar va me'yoridagi rag'bat.</p></article>
        <article><Compass /><span>04 / IMKON</span><h3>Skill Swap</h3><p>O'rgatish va o'rganish uchun mos talabalar.</p></article>
      </section>
      <section className="auth-section" id="kirish">
        <div className="auth-intro"><span className="auth-kicker"><ShieldCheck size={15} /> SHAXSIY TA'LIM MAKONI</span><h2>{authMode === "signup" ? <>O'sishingiz uchun<br />mustahkam <em>asos.</em></> : <>Yana davom<br />etishga <em>tayyormisiz?</em></>}</h2><p>{authMode === "signup" ? "Hisob yarating va maqsadlaringiz, rejalaringiz hamda rivojlanishingizni bir joyda tartibga soling." : "Hisobingizga kiring — rejalaringiz va o'qishdagi yutuqlaringiz sizni kutmoqda."}</p><div className="auth-assurances"><span><Check size={14} /> Shaxsiy rejalaringiz</span><span><Check size={14} /> Bitta hisob, barcha yutuqlar</span></div></div>
        <div className="auth-panel">
          <div className="auth-panel-heading"><span className="auth-panel-mark"><BrainCircuit size={18} /></span><div><small>FADIMUSS HISOBI</small><b>{authMode === "signup" ? "Yangi hisob yarating" : "Hisobingizga kiring"}</b></div><span className="auth-security"><ShieldCheck size={14} /> Himoyalangan</span></div>
          <div className="auth-tabs"><button className={authMode === "signup" ? "selected" : ""} onClick={() => setAuthMode("signup")}>Ro'yxatdan o'tish</button><button className={authMode === "login" ? "selected" : ""} onClick={() => setAuthMode("login")}>Kirish</button></div>
          {!firebaseConfigured ? <div className="setup-notice"><span className="notice-icon"><BookOpen size={18} /></span><div><b>Firebase sozlamasi kerak</b><p>Haqiqiy hisob va ma'lumotlarni yoqish uchun `.env.local` faylida Firebase web va server qiymatlarini kiriting. Sozlash tartibi README’da.</p></div></div> : <form key={authMode} className="auth-form" onSubmit={submitAuth}>
            <label>Email manzili<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ism@example.com" autoComplete="email" required /></label>
            <label>Parol<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Kamida 6 belgi" autoComplete={authMode === "signup" ? "new-password" : "current-password"} minLength={6} required /></label>
            {authError && <p className="form-error" role="alert">{authError}</p>}
            <button className="button button-navy" type="submit" disabled={submitting}>{submitting ? "Kutilmoqda..." : authMode === "signup" ? "Hisob yaratish" : "Kirish"}<ArrowRight size={16} /></button>
          </form>}
          <p className="auth-privacy"><ShieldCheck size={14} /> Ma'lumotlar faqat shaxsiy profilingizda saqlanadi.</p>
        </div>
      </section>
      <footer className="landing-footer"><a href="#top" className="brand"><span className="brand-mark">F</span><span>FaDiMuss<small>O'QISH VA RIVOJLANISH</small></span></a><span>Bir talaba. Bir profil. Butun rivojlanish yo'li.</span><span>© FaDiMuss</span></footer>
    </main>
  );
}

function Onboarding({ user, onSubmit, initialError }: { user: User; onSubmit: (values: Partial<StudentProfile> & { primaryGoal: string }) => Promise<void>; initialError: string }) {
  const [name, setName] = useState(user.displayName ?? "");
  const [education, setEducation] = useState("");
  const [goal, setGoal] = useState("");
  const [interests, setInterests] = useState("");
  const [skills, setSkills] = useState("");
  const [minutes, setMinutes] = useState(90);
  const [error, setError] = useState(initialError);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await onSubmit({
        displayName: name.trim(), ...(education ? { educationLevel: education } : {}),
        primaryGoal: goal.trim(), interests: interests.split(",").map((item) => item.trim()).filter(Boolean),
        skills: skills.split(",").map((item) => item.trim()).filter(Boolean),
        dailyAvailableMinutes: minutes, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    } catch (saveError) {
      const code = typeof saveError === "object" && saveError !== null && "code" in saveError
        ? String(saveError.code)
        : "";
      if (code === "permission-denied") {
        setError("Firestore qoidalari yozishga ruxsat bermadi. firestore.rules faylini Firebase loyihasiga deploy qiling.");
      } else if (code === "unauthenticated") {
        setError("Firebase hisob sessiyasi tugagan. Qayta kirib ko'ring.");
      } else if (code === "unavailable") {
        setError("Firestore xizmatiga ulanib bo'lmadi. Internet yoki Firebase holatini tekshiring.");
      } else if (code === "invalid-argument") {
        setError("Saqlanayotgan ma'lumot formati noto'g'ri. Maydonlarni tekshirib qayta urinib ko'ring.");
      } else {
        setError(`Ma'lumotlar saqlanmadi${code ? ` (${code})` : ""}. Qayta urinib ko'ring.`);
      }
    }
    finally { setSaving(false); }
  }

  return <main className="onboarding-shell"><a href="/#top" className="brand"><span className="brand-mark">F</span><span>FaDiMuss<small>O'QISH VA RIVOJLANISH</small></span></a><div className="onboarding-wrap"><span className="eyebrow">BIRINCHI QADAM / 01</span><h1>Yo'lingizni<br /><em>belgilaymiz.</em></h1><p>Javoblaringiz kunlik reja va tavsiyalarni sizga moslashtiradi.</p><form className="onboarding-form" onSubmit={submit}>
    <label>Ismingiz<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} placeholder="Ism Familiya" /></label>
    <label>Ta'lim darajasi <span className="optional">ixtiyoriy</span><select value={education} onChange={(event) => setEducation(event.target.value)}><option value="">Tanlang</option><option>Maktab</option><option>Bakalavr</option><option>Magistratura</option><option>Boshqa</option></select></label>
    <label>Hozirgi asosiy maqsadingiz<input value={goal} onChange={(event) => setGoal(event.target.value)} required maxLength={140} placeholder="Masalan, IELTS 7.0 olish" /></label>
    <label>Qiziqishlar <span className="optional">vergul bilan ajrating</span><input value={interests} onChange={(event) => setInterests(event.target.value)} maxLength={240} placeholder="Dizayn, ingliz tili, texnologiya" /></label>
    <label>Hozirgi ko'nikmalar <span className="optional">ixtiyoriy</span><input value={skills} onChange={(event) => setSkills(event.target.value)} maxLength={240} placeholder="Figma, yozish, taqdimot" /></label>
    <label>Kuniga ajratadigan vaqtingiz <b className="minutes-value">{minutes} daqiqa</b><input className="range-input" type="range" min="25" max="360" step="5" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button button-navy" disabled={saving}>{saving ? "Saqlanmoqda..." : "Maqsadni saqlash"}<ArrowRight size={16} /></button>
  </form><small className="privacy-note">Ma'lumotlaringiz shaxsiy hisobingizda saqlanadi.</small></div></main>;
}