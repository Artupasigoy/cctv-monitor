# Security, Credentials, Logging, Git, Dependency

## Internet Independence

Aplikasi HARUS dapat digunakan tanpa internet setelah seluruh dependency/build/runtime tersedia lokal.

Target:

```
Internet: OFF
LAN: ON
CCTV: ON
```

Aplikasi tetap harus: membuka UI, menampilkan kamera, mengganti layout, mengganti kamera, fullscreen, reconnect stream, menampilkan status kamera.

Jangan membuat runtime dependency terhadap: CDN, Google Fonts, external JavaScript/CSS/image/icon service, analytics, telemetry, remote API. Semua asset runtime harus lokal.

## Security

Aplikasi harus LAN-only.

- Jangan expose aplikasi ke internet.
- Jangan buka port secara otomatis ke internet.
- Jangan gunakan UPnP, port forwarding, Cloudflare Tunnel, remote access.
- Jangan kirim credential kamera ke pihak ketiga.

## Credential Security

Password kamera merupakan secret.

Jangan: hardcode, commit ke Git, taruh di README, taruh di source code, taruh dalam log.

- Gunakan local secure storage jika tersedia dan diperlukan.
- Jika menyimpan configuration file: jangan commit file credential; sediakan example config tanpa password, misal `config.example.json` (bukan `config.json` berisi credential asli).

## Logging

Logging membantu troubleshooting tanpa membocorkan secret.

BOLEH:

```
Camera 1 connection failed
Camera 2 reconnecting
Camera 3 online
```

JANGAN:

```
rtsp://admin:password@192.168.1.101/...
```

Password harus selalu di-redact.

## Configuration

Configuration dipisahkan dari source code. Jangan `const CAMERA_IP = "192.168.1.101"`.

User harus bisa mengganti IP, port, username, password, RTSP path, camera name tanpa mengubah source code.

### Default Camera Configuration

Jangan masukkan IP kamera milik developer ke repository. Gunakan `cameras.example.json` / `config.example.json`:

```json
{
  "cameras": [
    {
      "id": "cam1",
      "name": "Camera 1",
      "host": "",
      "port": 554,
      "rtspPath": "",
      "username": "",
      "password": ""
    }
  ]
}
```

## Git Rules

Jangan commit: password, API key, camera credential, private IP jika tidak perlu, personal configuration, generated build files, logs, runtime cache. Gunakan `.gitignore` yang sesuai.

## Dependency Policy

Setiap dependency harus punya alasan. Sebelum menambah package:

1. Apakah benar-benar diperlukan?
2. Apakah bisa dilakukan dengan native API?
3. Apakah dependency aktif dipelihara?
4. Apakah menambah attack surface?
5. Apakah bekerja offline?
6. Apakah menambah ukuran aplikasi signifikan?

Jika tidak jelas: jangan tambahkan dependency.

## Error Handling

Error harus mudah dipahami user. Jangan tampilkan stack trace ke user biasa.

```
Camera Offline
Tidak dapat terhubung ke kamera.
Mencoba menghubungkan kembali...
```

Developer mode boleh menampilkan detail teknis.
