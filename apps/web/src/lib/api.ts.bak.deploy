const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "/api";

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

function getAdminPassword() {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("admin_password");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const adminPw = getAdminPassword();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(adminPw && path.startsWith("/admin") ? { "X-Admin-Password": adminPw } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 401) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      typeof body.detail === "string" ? body.detail : "Request failed"
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Auth ────────────────────────────────────────────
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface ProfileOut {
  display_name: string;
  avatar_url: string | null;
  goal_type: string;
  onboarded_at: string | null;
}

export interface UserOut {
  id: string;
  username: string;
  email: string;
  created_at: string;
  profile: ProfileOut | null;
  is_admin?: boolean;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  display_name: string;
  goal_type: string;
}

export interface ProfileUpdateRequest {
  display_name?: string;
  height_cm?: number;
  weight_kg?: number;
  dob?: string;
  sex?: string;
  goal_type?: string;
  onboarded_at?: string;
}

// ─── Logs ────────────────────────────────────────────
export interface KetoneLog {
  id: string;
  ts: string;
  value_mmol: number;
  source: string;
  note: string | null;
  ketone_type: string;
  urine_category: string | null;
  urine_mg_dl: number | null;
  paired_reading_time: string | null;
  paired_device_id: string | null;
}

export type UrineCategory = "negative" | "trace" | "small" | "moderate" | "large";

export interface KetonePair {
  ts: string;
  acetone_delta: number;
  breath_label: string | null;
  urine_category: string;
  urine_rank: number;
  urine_mmol: number;
  breath_mmol_est: number;
}

export interface AgreementMatrixRow {
  breath_label: string;
  counts: Record<string, number>;
}

export interface BlandAltmanPoint {
  mean: number;
  diff: number;
  ts: string;
}

export interface BlandAltman {
  n: number;
  bias: number | null;
  sd: number | null;
  loa_lower: number | null;
  loa_upper: number | null;
  unit: string;
  interpretation: string;
  points: BlandAltmanPoint[];
}

export interface KetoneAgreementOut {
  n: number;
  spearman_r: number | null;
  interpretation: string;
  pairs: KetonePair[];
  agreement_matrix: AgreementMatrixRow[];
  bland_altman: BlandAltman;
}

export interface WeightLog {
  id: string;
  ts: string;
  kg: number;
}

export interface MealLog {
  id: string;
  ts: string;
  name: string;
  kcal: number | null;
  carbs_g: number | null;
}

export interface ActivityLog {
  id: string;
  ts: string;
  kind: string;
  duration_min: number;
  kcal: number | null;
}

// ─── Gamification ────────────────────────────────────
export interface XPOut {
  total: number;
  level: number;
  level_name: string;
  xp_in_level: number;
  xp_to_next: number;
}

export interface StreakOut {
  current: number;
  longest: number;
  last_active_date: string | null;
  freezes_left: number;
}

export interface BadgeOut {
  code: string;
  name: string;
  icon: string;
  description: string;
  awarded_at: string;
}

export interface QuestOut {
  id: string;
  code: string;
  title: string;
  description: string;
  xp_reward: number;
  progress: number;
  target: number;
  completed_at: string | null;
}

// ─── Content ─────────────────────────────────────────
export interface ArticleOut {
  slug: string;
  title: string;
  category: string;
  cover_url: string | null;
  reading_min: number;
  tags: string[] | null;
  published_at: string | null;
  xp_reward: number;
  is_read: boolean;
}

export interface ArticleDetailOut extends ArticleOut {
  content: string | null;
}

export interface ArticleCompleteOut {
  xp_awarded: number;
  total_xp: number;
}

// ─── Admin ───────────────────────────────────────────
export interface AdminDeviceOut {
  id: string;
  kind: string;
  sensor_model: string | null;
  active: boolean;
  needs_recalibration: boolean;
  last_calibrated_at: string | null;
}

export interface AdminReadingSummary {
  total_readings: number;
  last_reading_at: string | null;
  last_label: string | null;
  last_acetone_delta: number | null;
  last_quality_score: number | null;
}

export interface AdminUserOut {
  id: string;
  email: string;
  username: string;
  display_name: string | null;
  created_at: string;
  devices: AdminDeviceOut[];
  reading_summary: AdminReadingSummary;
}

export interface AdminReadingCreate {
  device_id: string;
  time?: string;
  ambient_voc?: number;
  breath_voc?: number;
  pressure_mean?: number;
  pressure_std?: number;
  breath_duration?: number;
  temp_c?: number;
  humidity_pct?: number;
  note?: string;
}

export interface AdminReadingOut {
  time: string;
  device_id: string;
  ambient_voc: number | null;
  breath_voc: number | null;
  acetone_delta: number | null;
  quality_score: number | null;
  reliability_score: number | null;
  metabolic_risk_index: number | null;
  confidence_score: number | null;
  label: string | null;
}

// ─── Sensor ──────────────────────────────────────────
/**
 * MetaBreath sensor reading. Column semantics after firmware v1 (metabreath.ino):
 *   - ambient_voc    = TGS1820 baseline_voltage (V)
 *   - breath_voc     = TGS1820 sensor_voltage   (V)
 *   - acetone_delta  = (sensor - baseline) × 1000 (mV)
 *   - pressure_mean  = XGZP6847A pressure_kpa   (kPa)
 *   - temp_c/humidity_pct = SHT31 readings
 */
export interface SensorReadingOut {
  time: string;
  device_id: string;
  ambient_voc: number | null;     // baseline_voltage (V)
  breath_voc: number | null;      // sensor_voltage (V)
  acetone_delta: number | null;   // mV
  pressure_mean: number | null;   // kPa (breath pressure)
  temp_c: number | null;
  humidity_pct: number | null;
  quality_score: number | null;
  reliability_score: number | null;
  environment_penalty: number | null;
  metabolic_risk_index: number | null;
  confidence_score: number | null;
  label: string | null;           // clean|low|moderate|high|unreliable
}

export interface DeviceOut {
  id: string;
  kind: string;
  active: boolean;
  needs_recalibration: boolean;
  last_calibrated_at: string | null;
  sensor_model: string | null;
}

export interface CalibrationReportOut {
  device_id: string;
  report_generated_at: string;
  lod_ppm: number;
  repeatability_cv_pct: number;
  drift_slope_ppm_per_day: number;
  cross_sensitivity_note: string;
  n_calibrations: number;
  latest_drift_score: number;
  needs_recalibration: boolean;
}

// ─── AI ──────────────────────────────────────────────
export interface TrendResponse {
  device_id: string;
  trend_direction: "increasing" | "decreasing" | "stable" | "insufficient_data";
  slope_ppm_per_day: number | null;
  predicted_points: { time: string; predicted_acetone: number }[];
  confidence: number;
  n_readings_used: number;
}

export interface ChatResponse {
  reply: string;
  refusal: boolean;
  disclaimer_appended: boolean;
}

// ─── Pilot Study ─────────────────────────────────────
export interface PilotSessionCreate {
  cohort: string;
  day_number: number;
  timepoint: string;
  bmi?: number;
  waist_cm?: number;
  age?: number;
  sex?: string;
  fasting_hours?: number;
  food_type?: string;
  activity_min?: number;
  sleep_hours?: number;
  homa_ir?: number;
  blood_glucose?: number;
  blood_ketone_mmol?: number;
}

export interface PilotSessionOut extends PilotSessionCreate {
  id: string;
  user_id: string;
  recorded_at: string;
}

export interface CorrelationOut {
  n: number;
  pearson_r: number | null;
  p_value: number | null;
  interpretation: string;
  adjusted_r: number | null;
  confounders_removed: string[];
}

// ─── Push / Reminders ────────────────────────────────
export interface ReminderOut {
  id: string;
  kind: string;
  schedule: string;
  message: string | null;
  next_fire_at: string | null;
  enabled: boolean;
  created_at: string;
}

// ─── API client ─────────────────────────────────────
export const api = {
  auth: {
    register: (data: RegisterRequest) =>
      request<TokenResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    login: (username: string, password: string) =>
      request<TokenResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      }),
    refresh: (refresh_token: string) =>
      request<TokenResponse>("/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refresh_token }),
      }),
    me: () => request<UserOut>("/auth/me"),
    updateProfile: (data: ProfileUpdateRequest) =>
      request<ProfileOut>("/profile", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  },
  logs: {
    getKetone: (params?: { days?: number }) =>
      request<KetoneLog[]>(
        `/logs/ketone${params?.days ? `?days=${params.days}` : ""}`
      ),
    postKetone: (data: {
      value_mmol?: number;
      source?: string;
      note?: string;
      ketone_type?: "blood" | "urine";
      urine_category?: UrineCategory;
      urine_mg_dl?: number;
      paired_reading_time?: string;
      paired_device_id?: string;
    }) =>
      request<KetoneLog>("/logs/ketone", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    getWeight: (params?: { days?: number }) =>
      request<WeightLog[]>(
        `/logs/weight${params?.days ? `?days=${params.days}` : ""}`
      ),
    postWeight: (data: { kg: number }) =>
      request<WeightLog>("/logs/weight", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    getMeal: (params?: { days?: number }) =>
      request<MealLog[]>(
        `/logs/meal${params?.days ? `?days=${params.days}` : ""}`
      ),
    postMeal: (data: { name: string; kcal?: number; carbs_g?: number }) =>
      request<MealLog>("/logs/meal", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    getActivity: (params?: { days?: number }) =>
      request<ActivityLog[]>(
        `/logs/activity${params?.days ? `?days=${params.days}` : ""}`
      ),
    postActivity: (data: { kind: string; duration_min: number; kcal?: number }) =>
      request<ActivityLog>("/logs/activity", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },
  gamification: {
    getXP: () => request<XPOut>("/me/xp"),
    getStreak: () => request<StreakOut>("/me/streak"),
    getBadges: () => request<BadgeOut[]>("/me/badges"),
    getQuestsToday: () => request<QuestOut[]>("/me/quests/today"),
  },
  content: {
    listArticles: () => request<ArticleOut[]>("/articles"),
    getArticle: (slug: string) => request<ArticleDetailOut>(`/articles/${slug}`),
    completeArticle: (slug: string) =>
      request<ArticleCompleteOut>(`/articles/${slug}/complete`, { method: "POST" }),
  },
  push: {
    subscribe: (data: { endpoint: string; p256dh: string; auth: string; ua?: string }) =>
      request<{ ok: boolean }>("/push/subscribe", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    getReminders: () => request<ReminderOut[]>("/reminders"),
    createReminder: (data: { kind: string; schedule: string; message?: string }) =>
      request<ReminderOut>("/reminders", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    toggleReminder: (id: string) =>
      request<ReminderOut>(`/reminders/${id}/toggle`, { method: "PATCH" }),
    deleteReminder: (id: string) =>
      request<void>(`/reminders/${id}`, { method: "DELETE" }),
  },
  sensor: {
    provisionToken: () =>
      request<{ token: string; expires_in: number; api_base: string }>("/sensor/provision/token", { method: "POST" }),
    listDevices: () => request<DeviceOut[]>("/sensor/devices"),
    getReadings: (deviceId: string, days = 7) =>
      request<SensorReadingOut[]>(`/sensor/readings?device_id=${deviceId}&days=${days}`),
    calibrationReport: (deviceId: string) =>
      request<CalibrationReportOut>(`/sensor/device/${deviceId}/calibration/report`),
    calibrateDevice: (deviceId: string, data: {
      baseline_voc: number;
      baseline_temp?: number;
      baseline_humidity?: number;
      baseline_pressure?: number;
      method?: string;
      notes?: string;
    }) =>
      request<{ id: string; drift_score: number; needs_recalibration?: boolean }>(
        `/sensor/device/${deviceId}/calibrate`,
        { method: "POST", body: JSON.stringify(data) }
      ),
    pairDevice: (data?: { kind?: string; sensor_model?: string; firmware_version?: string }) =>
      request<{
        device_id: string; mqtt_topic: string; mqtt_user: string;
        mqtt_broker: string; mqtt_port: number; secret: string; message: string;
      }>("/sensor/device/pair", { method: "POST", body: JSON.stringify(data ?? {}) }),
  },
  ai: {
    getTrend: (deviceId: string, days = 7) =>
      request<TrendResponse>(`/ai/trend?device_id=${deviceId}&days=${days}`),
    chat: (message: string, deviceId?: string) =>
      request<ChatResponse>("/ai/chat", {
        method: "POST",
        body: JSON.stringify({ message, device_id: deviceId }),
      }),
  },
  pilot: {
    createSession: (data: PilotSessionCreate) =>
      request<PilotSessionOut>("/pilot/session", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    listSessions: (cohort?: string) =>
      request<PilotSessionOut[]>(`/pilot/sessions${cohort ? `?cohort=${cohort}` : ""}`),
    getCorrelation: (cohort?: string) =>
      request<CorrelationOut>(`/pilot/correlation${cohort ? `?cohort=${cohort}` : ""}`),
    exportUrl: (cohort?: string) =>
      `${API_BASE}/pilot/export${cohort ? `?cohort=${cohort}` : ""}`,
  },
  admin: {
    verify: (password: string) =>
      request<{ ok: boolean }>("/admin/verify", {
        method: "POST",
        body: JSON.stringify({ password }),
      }),
    listUsers: () =>
      request<AdminUserOut[]>("/admin/users"),
    ensureManualDevice: (userId: string) =>
      request<AdminDeviceOut>(`/admin/device/ensure/${userId}`, { method: "POST" }),
    submitReading: (data: AdminReadingCreate) =>
      request<AdminReadingOut>("/admin/reading", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    ketoneAgreement: () =>
      request<KetoneAgreementOut>("/admin/ketone-agreement"),
  },
};
