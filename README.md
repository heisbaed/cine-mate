# CineMate

Cine is a small Windows desktop companion with a rounded cream shell, amber headphones and a glass face. He watches the cursor, blinks, waves when you approach, reacts when tapped, dances on a double-click and rests when the desktop is idle. He gently hovers above a soft glow, with small thruster pulses while drifting. Wandering can be disabled in Settings.

Click the speech icon beneath Cine to open a conversation. Click the dots for desktop options. Drag the character to move him. Appearance offers robot, cat and blob characters, four glows, three sizes and names.

Allow clicks through pet affects the character only; its dock stays clickable so you can always open Settings and switch the option off. Ctrl+Alt+M also switches click-through on or off and keeps Settings in sync. Transparent space around Cine does not block desktop clicks. Dragging holds mouse input until release. Text bubbles remain in front of the character, including at the screen's top edge.

## Run

```sh
npm install
npm run dev
```

For a production build, use `npm run build` then `npm start`. `npm run dist` creates a Windows installer in `release/`.

## Conversation

Add your Gemini API key in Settings and use **Test Gemini connection**. A personal `gemini.key` file is also supported by the main process; this file is ignored by Git. The current packaging configuration includes that file in personal builds, so remove it from `extraResources` before sharing an installer that should use each person's own key.

Gemini text models are discovered through Google's API. Cine prefers stable Flash-Lite models, remembers the last working model for each key and retries temporary service failures with bounded backoff. Removed models and models with no quota are skipped briefly. Conversation uses recent chat history, preserves full replies and reports connection, quota and blocked-response errors directly. A temporary failure offers **Try again** without adding your message twice. There is no silent switch to another AI provider.

Explicit local commands work separately, including `Pomodoro 25`, `remind me in 10 minutes to stretch`, `note buy milk`, `open downloads`, `pause music`, `tell me a joke` and `remember that my favorite color is green`. AI conversation itself does not execute Windows commands or inspect screen content.

## Verify

```sh
npm test
npm run typecheck
npm run build
```

`node_modules\.bin\electron.cmd scripts\preview.cjs` captures the real renderer with an isolated profile and mocked OS/AI services in `artifacts/previews/`. It verifies transparent windows, character sizes and animated frames; these previews do not prove a live Gemini response.

The character is an animated vector in `src/renderer/src/CineCharacter.tsx`. The desktop windows, cursor sensing and Windows integration live in `src/main/index.ts`.

`node_modules\.bin\electron.cmd scripts\verify-live-chat.cjs` performs an opt-in live check through the real chat form and Electron bridge, including a follow-up question that checks conversation context. It sends two short messages using the saved personal key and writes its result to `artifacts/live-chat/`.
# Offline voice recognition

Run `npm run speech:setup` before packaging to download the checksum-verified whisper.cpp Windows runtime and English base model. Installers include both, so users do not need Python or a separate download. The microphone starts off, including for existing profiles that previously enabled wake listening. Click the mic in Cine's dock or chat, wait for the recording cue, and speak. Click again to finish and send the recording; the microphone closes while Whisper processes the saved audio. Stopping the microphone preserves any transcription already in progress. Recordings are limited to thirty seconds. Recognition pauses during Cine's own speech. Whisper transcribes locally using four CPU threads at reduced priority, greedy decoding, and a window sized to the recording. Temporary command recordings are deleted after transcription.
