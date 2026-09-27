# Third-party software and voice attribution

The application bundles the following independently licensed components for offline speech synthesis:

- **Piper Windows runtime** (2023-11-14 release), MIT License. Source: https://github.com/rhasspy/piper. Its license text is included as `resources/piper/runtime/piper/LICENSE-PIPER.txt`.
- **eSpeak NG runtime and pronunciation data**, GPL-3.0-or-later. Source and license: https://github.com/espeak-ng/espeak-ng. The license text is included as `resources/piper/runtime/piper/LICENSE-ESPEAK-NG.txt`.
- **en_US-lessac-high voice model**, MIT License. Voice: Lessac, English (United States), high quality, 22.05 kHz. Source: https://huggingface.co/rhasspy/piper-voices/tree/v1.0.0/en/en_US/lessac/high. The model's configuration and attribution are included in `resources/piper-voice/en_US-lessac-high.onnx.json`.
- **ONNX Runtime**, MIT License, distributed as part of the Piper Windows runtime. Source: https://github.com/microsoft/onnxruntime.

Generated speech is stored locally by the app. No word text is sent to an external service.
