// src/index.ts
import "dotenv/config";
import express from "express";
import { AccessToken } from "@livekit/server-sdk";
import { callAgentTool } from "./toolsClient";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LOG_LEVEL = process.env.LOG_LEVEL || "info";

function log(...args: any[]) {
  if (LOG_LEVEL !== "silent") {
    console.log("[worker]", ...args);
  }
}

// Simple health check for Railway
app.get("/health", (_req, res) => {
  res.json({ ok: true, status: "healthy" });
});

/**
 * POST /start-agent
 * Called by your Supabase `start-agent-session` edge function.
 * Body: { roomName: string, agentId?: string, sessionId?: string, config?: any }
 */
app.post("/start-agent", async (req, res) => {
  try {
    const { roomName, agentId, sessionId, config } = req.body || {};

    if (!roomName) {
      return res.status(400).json({ ok: false, error: "missing_roomName" });
    }

    log("Starting agent for room:", roomName, "agentId:", agentId, "sessionId:", sessionId);

    // Fire-and-forget agent logic
    startAgentSession({ roomName, agentId, sessionId, config }).catch((err) => {
      console.error("[agent] Unhandled agent error:", err);
    });

    res.json({ ok: true, message: "Agent started", roomName, agentId, sessionId });
  } catch (err: any) {
    console.error("[/start-agent] Error:", err);
    res.status(500).json({ ok: false, error: "server_error", details: err?.message || String(err) });
  }
});

interface StartAgentParams {
  roomName: string;
  agentId?: string;
  sessionId?: string;
  config?: any;
}

/**
 * This is the main agent loop skeleton.
 * TODOs:
 *  - connect to LiveKit room as an agent participant
 *  - stream user audio to STT
 *  - call LLM with tools
 *  - call agent-tools for bookings, leads, etc.
 *  - send TTS audio back to LiveKit
 */
async function startAgentSession(params: StartAgentParams) {
  const { roomName, agentId, sessionId, config } = params;

  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    console.error("[agent] LiveKit env vars missing, cannot start agent");
    return;
  }

  log("Agent loop starting for room:", roomName);

  // 1) Create an access token for this agent participant (not strictly required here,
  //    but useful if you later run a LiveKit client inside this worker).
  const agentIdentity = `agent-${agentId ?? "default"}`;
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: agentIdentity,
    metadata: JSON.stringify({
      agentId,
      sessionId,
      type: "voice_agent"
    })
  });
  at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
  const agentToken = at.toJwt();

  log("Generated agent LiveKit token (not printed for security).");

  // TODO: here you would:
  //  - Use LiveKit Agents SDK or livekit-client-in-Node to join the room with agentToken
  //  - Subscribe to user audio track
  //  - Pipe audio to STT (OpenAI, Deepgram, etc.)
  //  - Send transcripts to LLM with tools
  //  - When LLM chooses a tool → callAgentTool(...)
  //  - Create TTS audio from LLM responses and publish to room

  // For now, this is a placeholder that demonstrates how to call a tool.
  if (agentId) {
    try {
      log("Calling demo tool: create_lead");

      const toolResult = await callAgentTool({
        tool: "create_lead",
        agentId,
        sessionId,
        args: {
          name: "Demo Lead from Worker",
          email: "demo@example.com",
          source: "livekit_worker_demo"
        }
      });

      log("Tool call result:", toolResult);
    } catch (err: any) {
      console.error("[agent] Demo tool call failed:", err?.message || err);
    }
  }

  log("Agent session skeleton complete for room:", roomName);
}

app.listen(PORT, () => {
  log(`LiveKit worker listening on port ${PORT}`);
});