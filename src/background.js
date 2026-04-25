importScripts("prompts.js");

const DEFAULT_SETTINGS = {
  apiKey: "",
  model: "gpt-4.1-mini",
  apiUrl: "https://api.openai.com/v1/responses",
  extraInstructions: "",
  temperature: 0.3
};

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  await chrome.storage.sync.set({ ...DEFAULT_SETTINGS, ...current });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type) {
    return false;
  }

  if (message.type === "ytn:get-settings") {
    getSettings()
      .then((settings) => sendResponse({ ok: true, settings }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "ytn:analyze-video") {
    analyzeVideo(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

async function analyzeVideo(payload) {
  validatePayload(payload);

  const settings = await getSettings();
  if (!settings.apiKey) {
    throw new Error("Add your API key in the extension options before running analysis.");
  }

  const prompt = buildAnalysisPrompt(payload);
  const responseText = await runModel(settings, prompt);
  const parsed = parseModelJson(responseText);

  return {
    ...parsed,
    source: {
      title: payload.title,
      channel: payload.channel,
      videoId: payload.videoId,
      transcriptLength: payload.transcript.length
    }
  };
}

function validatePayload(payload) {
  if (!payload?.transcript?.trim()) {
    throw new Error("No transcript found for this video.");
  }
}

async function runModel(settings, prompt) {
  const instructionSuffix = settings.extraInstructions?.trim()
    ? `\n\nAdditional instructions:\n${settings.extraInstructions.trim()}`
    : "";

  const body = {
    model: settings.model,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: `${YTN_SYSTEM_PROMPT}${instructionSuffix}`
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: prompt
          }
        ]
      }
    ],
    temperature: Number(settings.temperature) || 0.3
  };

  const response = await fetch(settings.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI request failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const text = extractResponseText(data);

  if (!text) {
    throw new Error("The AI response did not contain text output.");
  }

  return text;
}

function extractResponseText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text;
  }

  const output = data?.output || [];
  const parts = [];

  for (const item of output) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && content.text) {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n").trim();
}

function parseModelJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    return JSON.parse(cleaned);
  }
}
