# AGENTS.md — Local CCTV Monitor

> Entry point. Baca file yang relevan dengan task, jangan baca semua file.

## Project Overview

Desktop app untuk monitoring live CCTV lokal (LAN-only, offline-first). Monitor 4 kamera EZVIZ via RTSP lokal. Tanpa recording, tanpa playback, tanpa cloud, tanpa internet.

Prioritas:

1. Stabilitas streaming
2. LAN-only / offline-first
3. Ringan
4. Security
5. UX monitoring CCTV
6. Maintainability

## Stack

- Frontend: React + TypeScript + Vite
- Desktop shell: launcher Go single binary (serve web + scan LAN + spawn go2rtc + buka browser)
- Browser: bundled Chromium (opsional) atau browser sistem — low-spec friendly
- Streaming: go2rtc (RTSP in → WebRTC out)

## Rules Inti

- TIDAK menambahkan fitur di luar live CCTV monitoring tanpa alasan jelas.
- TIDAK menambahkan dependency tanpa alasan (lihat `security.md`).
- TIDAK ada recording / playback / cloud / internet dependency.
- TIDAK ada credential di source code / log / git.
- Kamera dan go2rtc harus berjalan penuh saat internet OFF, LAN ON.
- Jangan hardcode IP kamera; semuanya configurable.

## Routing — baca file berikut sesuai task

| Kalau mengerjakan...                                  | Baca file                          |
| ----------------------------------------------------- | ---------------------------------- |
| Setiap task, arsitektur, tech stack, struktur folder  | `docs/agents/architecture.md`      |
| UI React, komponen, layout, fullscreen, state         | `docs/agents/frontend.md`          |
| go2rtc, RTSP, WebRTC, reconnect, lifecycle stream     | `docs/agents/streaming.md`         |
| Security, credential, logging, git, dependency        | `docs/agents/security.md`          |
| Launcher, go2rtc process, startup, packaging | `docs/agents/desktop.md`      |
| Testing, test matrix, offline test, DoD               | `docs/agents/testing.md`           |

## Out of Scope (JANGAN implementasikan)

Recording, playback, NVR, cloud storage, AI/object/face detection, motion recording, remote viewing over internet, mobile app, user registration, cloud auth, social login, camera sharing, multi-site, payment, subscription, analytics, advertisements, notification system, cloud sync.
