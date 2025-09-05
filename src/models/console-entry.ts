import { z } from "zod";

// Console log levels supported
export const ConsoleLevels = [
  "log",
  "debug",
  "info",
  "warn",
  "error",
] as const;

export type ConsoleLevel = (typeof ConsoleLevels)[number];

// Base interface for a console entry
export interface ConsoleEntry {
  level: ConsoleLevel;
  timestamp: number; // Unix ms
  message: string;
  source: string; // e.g. "/src/main.ts:12:3" or "unknown"
}

// Zod schema for the base entry fields
export const ConsoleEntrySchema = z
  .object({
    level: z.enum(ConsoleLevels),
    timestamp: z
      .number({ required_error: "timestamp is required" })
      .int("timestamp must be an integer")
      .gt(0, "timestamp must be a positive integer"),
    message: z
      .string({ required_error: "message is required" })
      .min(1, "message cannot be empty"),
    // Accept "unknown" or any string that ends with :line:column (tolerant of URLs/paths)
    source: z
      .string({ required_error: "source is required" })
      .refine(
        (s) => s === "unknown" || /.+:\d+:\d+$/.test(s),
        {
          message: "source must be 'unknown' or 'file:line:column'",
        },
      ),
  })
  .strict();

// State machine for ConsoleEntry lifecycle
export enum ConsoleEntryState {
  Created = "Created",
  Buffered = "Buffered",
  Streamed = "Streamed",
}

export type StatefulConsoleEntry = ConsoleEntry & { state: ConsoleEntryState };

export const StatefulConsoleEntrySchema = ConsoleEntrySchema.extend({
  state: z.nativeEnum(ConsoleEntryState),
}).strict();

// Valid transitions map
const VALID_TRANSITIONS: Record<ConsoleEntryState, ConsoleEntryState[]> = {
  [ConsoleEntryState.Created]: [ConsoleEntryState.Buffered],
  [ConsoleEntryState.Buffered]: [ConsoleEntryState.Streamed],
  [ConsoleEntryState.Streamed]: [],
};

export function isValidTransition(
  from: ConsoleEntryState,
  to: ConsoleEntryState,
): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export function createConsoleEntry(
  input: z.input<typeof ConsoleEntrySchema>,
): StatefulConsoleEntry {
  const data = ConsoleEntrySchema.parse(input);
  return { ...data, state: ConsoleEntryState.Created };
}

export function toBuffered(entry: StatefulConsoleEntry): StatefulConsoleEntry {
  if (entry.state !== ConsoleEntryState.Created) {
    throw new Error(
      `Invalid transition: ${entry.state} -> ${ConsoleEntryState.Buffered}`,
    );
  }
  return { ...entry, state: ConsoleEntryState.Buffered };
}

export function toStreamed(entry: StatefulConsoleEntry): StatefulConsoleEntry {
  if (entry.state !== ConsoleEntryState.Buffered) {
    throw new Error(
      `Invalid transition: ${entry.state} -> ${ConsoleEntryState.Streamed}`,
    );
  }
  return { ...entry, state: ConsoleEntryState.Streamed };
}

export function isConsoleEntry(value: unknown): value is ConsoleEntry {
  const res = ConsoleEntrySchema.safeParse(value);
  return res.success;
}

export function parseConsoleEntry(
  value: unknown,
): ConsoleEntry | undefined {
  const res = ConsoleEntrySchema.safeParse(value);
  return res.success ? res.data : undefined;
}

