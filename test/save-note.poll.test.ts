/**
 * The status wait, with a fake clock: `sleep` advances `now` instantly, so
 * a 10-second wait runs in microseconds and the timing is exact.
 */
import { describe, expect, it } from "vitest";

import type { DocumentStatus } from "../src/mentat/api-schemas.js";
import { MentatUnavailableError } from "../src/mentat/errors.js";
import { POLL_INTERVAL_MS, POLL_TIMEOUT_MS, waitForProcessing } from "../src/tools/save-note/poll.js";
import { NOTE_ID } from "./fixtures.js";

function status(value: string, overrides: Partial<DocumentStatus> = {}): DocumentStatus {
  return { document_id: NOTE_ID, status: value, title: "T", error_message: null, chunk_count: 1, ...overrides };
}

/** A fake clock plus a client answering from a script, one entry per call. */
function setup(script: Array<DocumentStatus | Error>) {
  let clock = 0;
  const sleeps: number[] = [];
  let calls = 0;
  const client = {
    documentStatus: async () => {
      const next = script[Math.min(calls, script.length - 1)];
      calls += 1;
      if (next instanceof Error) throw next;
      return next as DocumentStatus;
    },
  };
  const options = {
    now: () => clock,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      clock += ms;
    },
  };
  return { client, options, sleeps, calls: () => calls };
}

describe("waitForProcessing", () => {
  it("returns at once when the note is already completed", async () => {
    const { client, options, sleeps } = setup([status("completed")]);
    const outcome = await waitForProcessing(client, NOTE_ID, options);

    expect(outcome).toEqual({ kind: "settled", document: status("completed") });
    expect(sleeps).toEqual([]);
  });

  it("keeps checking until processing completes", async () => {
    const { client, options, calls } = setup([status("pending"), status("processing"), status("completed")]);
    const outcome = await waitForProcessing(client, NOTE_ID, options);

    expect(outcome.kind).toBe("settled");
    expect(calls()).toBe(3);
  });

  it("treats failed as final", async () => {
    const { client, options } = setup([status("processing"), status("failed", { error_message: "Embedding failed" })]);
    const outcome = await waitForProcessing(client, NOTE_ID, options);
    expect(outcome).toMatchObject({ kind: "settled", document: { status: "failed", error_message: "Embedding failed" } });
  });

  it("gives up after the timeout and reports the last status", async () => {
    const { client, options, sleeps } = setup([status("processing")]);
    const outcome = await waitForProcessing(client, NOTE_ID, options);

    expect(outcome).toEqual({ kind: "still_processing", document: status("processing") });
    expect(sleeps.reduce((a, b) => a + b, 0)).toBe(POLL_TIMEOUT_MS);
    expect(sleeps.every((ms) => ms <= POLL_INTERVAL_MS)).toBe(true);
  });

  it("never waits past the deadline, even with an uneven interval", async () => {
    const { client, options, sleeps } = setup([status("pending")]);
    await waitForProcessing(client, NOTE_ID, { ...options, timeoutMs: 2_500, intervalMs: 1_000 });
    expect(sleeps).toEqual([1_000, 1_000, 500]);
  });

  it("keeps trying through a transient error", async () => {
    const { client, options } = setup([new MentatUnavailableError("down"), status("completed")]);
    expect((await waitForProcessing(client, NOTE_ID, options)).kind).toBe("settled");
  });

  it("reports unknown, without throwing, when the status can never be read", async () => {
    const { client, options } = setup([new MentatUnavailableError("down")]);
    expect(await waitForProcessing(client, NOTE_ID, options)).toEqual({ kind: "unknown" });
  });

  it("keeps the last known status when later checks fail", async () => {
    const { client, options } = setup([status("processing"), new MentatUnavailableError("down")]);
    expect(await waitForProcessing(client, NOTE_ID, options)).toEqual({
      kind: "still_processing",
      document: status("processing"),
    });
  });
});
