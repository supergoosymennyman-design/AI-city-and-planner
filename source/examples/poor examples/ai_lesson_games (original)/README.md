ai-lesson-games/
├── index.html              # Main menu
├── lesson1.html            # Magic Studio (Shapes)
├── lesson2.html            # Sorting Shapes
├── settings.html           # Configuration panel
├── assets/
│   ├── style.css           # Shared styles
│   ├── config.js           # Settings management
│   ├── utils.js            # TTS/STT/API utilities
│   └── conversation.js     # Chat flow manager
└── server.py               # One-line local server


# Your existing command:
./llama-server -m qwen2.5-2b.gguf --mmproj qwen2.5-2b-mmproj.gguf --port 8080 --host 0.0.0.0


cd /path/to/ai-lesson-games
python3 server.py 8000


http://localhost:8000
