export type { paths, components, operations } from "./schema";

// Convenience aliases for common types
export type RegisterRequest = components["schemas"]["RegisterRequest"];
export type LoginRequest = components["schemas"]["LoginRequest"];
export type TokenResponse = components["schemas"]["TokenResponse"];
export type UserOut = components["schemas"]["UserOut"];
export type ProfileOut = components["schemas"]["ProfileOut"];

// AI / sensor endpoints added alongside the ml_inference bare-except fix,
// personal baseline, inline interpretation, and health report work.
export type BaselineOut = components["schemas"]["BaselineOut"];
export type SensorReport = components["schemas"]["SensorReport"];
export type ThresholdsResponse = components["schemas"]["ThresholdsResponse"];
export type InterpretRequest = components["schemas"]["InterpretRequest"];
export type InterpretResponse = components["schemas"]["InterpretResponse"];
export type DailyStat = components["schemas"]["DailyStat"];
export type SessionSummary = components["schemas"]["SessionSummary"];

import type { components } from "./schema";
