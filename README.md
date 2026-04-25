<<<<<<< HEAD
# YouTube to Notion Notes

A Chrome extension MVP that turns a YouTube video into structured AI notes, section-by-section visual explanations, and a Notion-inspired reading layout.

## What it does

- Detects YouTube watch pages
- Extracts the video transcript from available captions
- Sends the transcript to an AI model that creates:
  - executive summary
  - chapter-by-chapter notes
  - visual breakdowns for each section
  - action items and glossary
- Renders the output in a Notion-style side panel on YouTube
- Lets you copy the result as Markdown or JSON

## Project structure

- `manifest.json`: Chrome extension manifest
- `src/background.js`: service worker, AI orchestration, storage, transcript analysis
- `src/content.js`: YouTube page integration and panel UI
- `src/popup.*`: quick actions for the active tab
- `src/options.*`: settings for API key, model, and prompt preferences

## How it works

1. Open a YouTube video page.
2. The content script reads the transcript from YouTube caption tracks when available.
3. The extension sends the transcript, title, chapters, and metadata to the background worker.
4. The background worker calls a configurable AI endpoint.
5. The AI returns structured JSON following the schema in `src/prompts.js`.
6. The content script renders the notes into a Notion-like side panel.

## Setup

1. Open Chrome and go to `chrome://extensions`.
2. Enable `Developer mode`.
3. Choose `Load unpacked`.
4. Select this project folder.
5. Open the extension options page.
6. Fill in:
   - API key
   - model name
   - API base URL

Default values are set for the OpenAI Responses API:

- Base URL: `https://api.openai.com/v1/responses`
- Model: `gpt-4.1-mini`

You can swap these out if you want to use a different compatible endpoint.

## Notes

- Transcript extraction depends on captions being available on the video.
- This MVP creates visual descriptions and structured note blocks. It does not yet generate real diagrams or capture video frames automatically.
- For better quality, keep videos under roughly 20 to 30 minutes until chunked processing is added.

## Next improvements

- Notion export via the Notion API
- Chunking for long videos
- Frame capture and scene cards
- Local caching per video
- Multi-language transcript support
- Search across saved notes
=======
# youtube-to-notion-notes
>>>>>>> b26ff2e018bf93c64e34b6015c03a41402fa95b3
