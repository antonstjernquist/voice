# Voice

A minimal, privacy-focused voice-to-text desktop app for macOS. Record your voice with a global hotkey and get instant transcriptions powered by local Whisper AI - no internet connection or API keys required.

## Features

- **Push-to-Talk Recording** - Hold `⇧⌘Space` to record, release to transcribe
- **Local Transcription** - Uses Whisper.cpp for fast, private speech-to-text
- **Multiple Model Sizes** - Choose between Small (500MB), Medium (1.5GB), or Large (3GB) for speed vs accuracy tradeoffs
- **Audio Device Selection** - Pick your preferred microphone from system inputs
- **Floating Overlay** - Minimalist UI with voice-reactive equalizer bars
- **System Tray** - Lives quietly in your menu bar, accessible anytime
- **Clipboard Integration** - Transcribed text is automatically copied to clipboard

## Screenshots

<p align="center">
  <img src="https://github.com/user-attachments/assets/placeholder-recording.png" alt="Recording overlay" width="240" />
  <br />
  <em>Voice-reactive equalizer during recording</em>
</p>

## Installation

### Prerequisites

- macOS 12.0 or later
- [Rust](https://rustup.rs/) (for building from source)
- [pnpm](https://pnpm.io/) (for building from source)

### Download

Download the latest `.dmg` from [Releases](https://github.com/antonstjernquist/voice/releases).

### Build from Source

```bash
# Clone the repository
git clone https://github.com/antonstjernquist/voice.git
cd voice

# Install dependencies
pnpm install

# Run in development mode
pnpm tauri dev

# Build for production
pnpm tauri build
```

## Usage

1. **First Launch** - Grant microphone and accessibility permissions when prompted
2. **Download Model** - The app will download the Whisper model on first use (~500MB for Small)
3. **Record** - Hold `⇧⌘Space` anywhere to start recording
4. **Transcribe** - Release the keys to transcribe and copy to clipboard
5. **Paste** - Use `⌘V` to paste the transcribed text

### Settings

Click the tray icon and select "Settings..." to configure:

- **Audio Input** - Select your preferred microphone
- **Whisper Model** - Choose model size (Small/Medium/Large)
- **Permissions** - Check and manage system permissions

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | [Tauri 2.0](https://tauri.app/) |
| Frontend | [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) |
| Styling | [Tailwind CSS 4](https://tailwindcss.com/) |
| Audio | [cpal](https://github.com/RustAudio/cpal) |
| Transcription | [whisper-rs](https://github.com/tazz4843/whisper-rs) (Whisper.cpp bindings) |
| Build | [Vite](https://vitejs.dev/) |
| Testing | [Vitest](https://vitest.dev/) + [React Testing Library](https://testing-library.com/) |

## Development

```bash
# Run development server with hot reload
pnpm tauri dev

# Run frontend tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Type check
pnpm build
```

### Project Structure

```
voice/
├── src/                    # React frontend
│   ├── components/
│   │   ├── Overlay.tsx     # Recording overlay with equalizer
│   │   └── Settings.tsx    # Settings panel
│   └── App.tsx             # App routing
├── src-tauri/              # Rust backend
│   └── src/
│       ├── audio/          # Audio capture and processing
│       ├── transcription/  # Whisper integration
│       └── lib.rs          # Tauri commands and app setup
└── ...
```

## Privacy

Voice processes everything locally on your machine:

- Audio is captured and transcribed entirely offline
- No data is sent to external servers
- Whisper models are downloaded once and stored locally
- No accounts, API keys, or telemetry

## Permissions

Voice requires the following macOS permissions:

| Permission | Purpose |
|------------|---------|
| Microphone | Record audio for transcription |
| Accessibility | Register global keyboard shortcut |

## License

MIT

## Acknowledgments

- [OpenAI Whisper](https://github.com/openai/whisper) for the speech recognition model
- [Whisper.cpp](https://github.com/ggerganov/whisper.cpp) for the optimized C++ implementation
- [Tauri](https://tauri.app/) for the excellent cross-platform framework
