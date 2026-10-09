# CineMate — Cine the robot as a Windows screen companion

Standalone Electron app (separate from the `cine-verse` web project).

## Run it

- Installer: `release\CineMate Setup 1.0.0.exe` — install, launch from Start menu.
- Dev: `npm install`, then `npm run dev`.
- Rebuild installer: `npm run dist` (needs network once for tool downloads).

## Use it

- Three species (Pet tab or type "become cat"): robot, cat, blob. Name him anything ("your name is Noodle"), name yourself ("call me Sam").
- Four glows (gold/cyan/pink/green), three sizes, aura of quips that never repeat twice in a row.
- Moods with matching colors: praised = pink and hearts, scolded = blue sulk, laughing = golden shake, curious head-tilt every so often.
- Games: "play a game" (hotter/colder number hunt, 6 tries), "rock paper scissors", "score" for the trophy shelf — all remembered between launches.
- Laughs: "tell me a joke". Reads aloud: "read my clipboard" (plus optional voice replies in Settings).
- Real conversation when online (free AI backend, no key) — offline it still does time, pomodoros, reminders, singing and sulking.
- Tap = poke (poking while sad apologizes). Double-tap = dance. Drag anywhere. Right-click = click-through mode, start with Windows, quit.
- DJ mode: "play davido" searches Spotify for the actual song, "open spotify" launches it AND starts playback, "what's playing" reads the live track, pause/next/previous/volume/mute hit whatever is playing.
- Does stuff: "google cats", "youtube lofi", "open downloads", "lock pc", "screenshot" (saved to Pictures), "note buy milk" / "my notes" sticky pad, launches notepad/calculator/paint/terminal.
- Eyes track in 2D now (up/down included); chat window drags by its header; chat button sits top-right, clear of the pet.
- He comes to you now: welcome-back greets, 50-minute stretch nudges, water/posture check-ins, and a pulsing "thinking…" indicator while the cloud brain answers (with a lighter fallback for slow networks).
- Games: number hunt, rock-paper-scissors with a persistent trophy shelf. "Tell me a joke" for golden laughter. "Read my clipboard" reads text aloud.
- Truly conversational when online (free AI backend, no key needed); fully capable offline otherwise.

## Notes

- Unsigned build: Windows SmartScreen may ask “run anyway” on first install.
- No Rust/MSVC needed — pure Node/Electron. Global cursor sensing uses Electron's built-in `screen` API, no native modules.
