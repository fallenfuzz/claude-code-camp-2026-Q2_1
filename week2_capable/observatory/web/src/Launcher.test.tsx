// @vitest-environment jsdom

import {
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import { Launcher } from "./Launcher";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});

it("owns the screen while a new session is connecting", async () => {
  const user = userEvent.setup();
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
    if (String(input).endsWith("/api/sessions")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          version: 1,
          players: [{ id: "poucet", label: "poucet" }],
          sessions: [],
        }),
      } as Response);
    }
    return new Promise<Response>(() => undefined);
  });

  render(<Launcher theme="dark" onThemeChange={() => undefined} />);
  await user.click(
    await screen.findByRole("button", {
      name: /Start session as poucet/,
    }),
  );

  const transition = screen.getByRole("status");
  expect(transition).toHaveTextContent("Starting poucet");
  expect(transition).toHaveTextContent(
    "Connecting the agent and opening Live automatically",
  );
});

it("continues the last ended session without a reset", async () => {
  const user = userEvent.setup();
  const sessionId = "42085051-7b6e-4214-b610-308a1db4c4df";
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
    if (String(input).endsWith("/api/sessions")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          version: 1,
          players: [{ id: "poucet", label: "poucet" }],
          sessions: [{
            id: sessionId,
            player_id: "poucet",
            character: "Poucet",
            state: "stopped",
            live: false,
            created_at: "2026-08-10T12:00:00Z",
            updated_at: "2026-08-10T12:10:00Z",
            ended_at: "2026-08-10T12:10:00Z",
            latest_seq: 42,
            event_count: 42,
          }],
        }),
      } as Response);
    }
    return new Promise<Response>(() => undefined);
  });

  render(<Launcher theme="dark" onThemeChange={() => undefined} />);
  await user.click(
    await screen.findByRole("checkbox", { name: "Continue last session" }),
  );
  expect(screen.getByText(/Keeps the previous map/)).toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: /Continue session as poucet/ }),
  );

  const startCall = vi.mocked(fetch).mock.calls.find(([input]) =>
    String(input).includes("/api/sessions/start")
  );
  expect(startCall).toBeDefined();
  const options = startCall?.[1] as RequestInit;
  expect(JSON.parse(String(options.body))).toEqual({
    player_id: "poucet",
    reset: "none",
    continue_session_id: sessionId,
  });
});
