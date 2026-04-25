const form = document.getElementById("settingsForm");
const status = document.getElementById("status");

const fields = {
  apiKey: document.getElementById("apiKey"),
  apiUrl: document.getElementById("apiUrl"),
  model: document.getElementById("model"),
  temperature: document.getElementById("temperature"),
  extraInstructions: document.getElementById("extraInstructions")
};

const defaultSettings = {
  apiKey: "",
  apiUrl: "https://api.openai.com/v1/responses",
  model: "gpt-4.1-mini",
  temperature: 0.3,
  extraInstructions: ""
};

init();

async function init() {
  const settings = await chrome.storage.sync.get(defaultSettings);
  for (const [key, field] of Object.entries(fields)) {
    field.value = settings[key] ?? defaultSettings[key];
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const nextSettings = {
    apiKey: fields.apiKey.value.trim(),
    apiUrl: fields.apiUrl.value.trim(),
    model: fields.model.value.trim(),
    temperature: Number(fields.temperature.value),
    extraInstructions: fields.extraInstructions.value.trim()
  };

  await chrome.storage.sync.set(nextSettings);
  status.textContent = "Settings saved.";
  setTimeout(() => {
    status.textContent = "";
  }, 2200);
});
