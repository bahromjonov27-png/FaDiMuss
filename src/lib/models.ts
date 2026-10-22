import type { Timestamp } from "firebase/firestore";

export type Goal = {
  id: string;
  userId: string;
  title: string;
  description: string;
  category: string;
  targetDate?: Timestamp;
  status: "active" | "completed" | "paused";
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type StudyTask = {
  id: string;
  userId: string;
  goalId?: string;
  title: string;
  description: string;
  dueAt?: Timestamp;
  estimatedMinutes: number;
  importance: number;
  status: "todo" | "completed";
  createdAt: Timestamp;
  completedAt?: Timestamp;
};

export type StudentProfile = {
  uid: string;
  displayName: string;
  email: string;
  educationLevel?: string;
  interests: string[];
  dailyAvailableMinutes: number;
  timezone: string;
  skills: string[];
  onboardingCompleted: boolean;
  xp: number;
  streak: number;
  lastActiveDate?: string;
};

export type FocusSession = {
  id: string;
  userId: string;
  plannedMinutes: number;
  actualMinutes: number;
  sessionType: "focus" | "break";
  startedAt: Timestamp;
  endedAt?: Timestamp;
  completed: boolean;
  pointsAwarded: number;
};