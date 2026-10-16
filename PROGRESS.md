# CineMate progress — 2026-10-16

## Current delivery

Version **1.2.0** is installed at `%LOCALAPPDATA%\Programs\CineMate\CineMate.exe`. The installed `resources/app.asar` SHA-256 matched the packaged build. One application instance was confirmed running. Windows startup points to this installed executable. Click-through was saved as off to restore dragging immediately.

## Completed

- Expressive vector companion, animations, three sizes, configurable appearance and ten accessories, including a blue-white hoverboard. Headphones appear only during active music playback and support custom colors.
- Compact chat and text bubbles, dock chat toggle, face clocks/counters/timers, and playback controls. Top-edge bubbles render above the character and remain on screen.
- Click-through preference is separate from cursor hit testing. The dock remains interactive, Settings stays synchronized with Ctrl+Alt+M, and disabling click-through restores dragging. Mouse capture is retained while dragging.
- Local timer and countdown routing includes “set a 1 minute countdown” and number-word/hyphenated variants. These commands start the actual face timer instead of allowing AI to confirm an unstarted timer. Timer completion has an audible chime, including with voice replies off and music playing.
- Spotify desktop song search starts playback and verifies the media session. Explicit YouTube requests open search results and state that limitation.
- Windows voice replies with adjustable speed and expressive styles. Offline Whisper command recognition replaces Windows dictation text, retaining the English base model with faster decoding and recording-sized context.
- Microphone starts off. Click the mic, wait for the recording cue, speak, and click again to stop **and send**. Stopping closes capture and preserves the recording or transcription already in progress. Processing feedback appears in the bubble/chat; empty or failed captures show a message. Recordings are limited to 30 seconds and temporary audio/transcriptions are removed after processing.
- Tools include app launchers, live system status, screenshots, clipboard capture/history, notes, daily goals, mathematics challenges, stopwatch and timer/focus controls.
- Gemini chat retains conversation context, discovers supported text models, prefers Flash-Lite, and reports provider errors with bounded retries. Native monitoring and OS tasks use asynchronous processes to reduce pointer stalls.

## Verification

- Latest `npm run typecheck`: passed.
- Latest `npm test`: **42 passed, 0 failed**.
- `npm run dist`: produced `release/CineMate Setup 1.2.0.exe`; installed payload hash verified.
- `scripts/verify-click-through.cjs`: repeated enable/disable cycles, dock recovery, keyboard/Settings synchronization, actual pointer dragging, and visible top-edge bubble passed.
- `scripts/verify-countdown-mic.cjs`: local one-minute face countdown with chat hidden, startup microphone off, preserved transcription on stop, stop-and-send through actual Whisper, and microphone closed during processing passed. Stop-and-send uses a known audio fixture for deterministic recognition; microphone capture is tested separately.
- `scripts/verify-recording-stop.ps1`: real native microphone capture stopped and saved audio in about 858 ms with an 800 ms stop signal.
- Offline short-phrase integration: about **1.5 seconds** transcription. Generated conversational recording: about **1.8 seconds**. These timings are fixtures, not proof of the user's current recognition accuracy.
- Live Gemini conversation check retained a codeword across two turns. Timer chime was heard and confirmed by the user earlier in the session.

## Remaining limitations and next work

- Response delay remains: live Gemini requests took **4.7 and 8.1 seconds**, before adding transcription and Windows speech startup. Do not describe conversation as instant or claim this server wait has been fixed. Investigate streaming/time to first speech or alternative supported models using measured end-to-end latency.
- User voice recognition still needs a clearly cued real-user check on the latest installed build. Generated/fixture recognition does not establish accuracy for their microphone, accent or room.
- Explicit YouTube requests remain search-only; automatic playback verification currently targets Spotify desktop.
- Installer artifacts, personal keys, downloaded Whisper models/runtime, QA profiles, recordings and screenshots are local/ignored. Run `npm run speech:setup` before packaging from a fresh checkout; it downloads checksum-verified runtime/model assets and licenses.
- Native Electron checks require a single running app instance. Some recognition scripts also require `artifacts/wake-fixture.wav`, a local generated speech recording; do not treat absent fixtures as a product failure.
