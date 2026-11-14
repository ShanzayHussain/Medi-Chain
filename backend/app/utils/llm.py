import json
import os
import urllib.request
import urllib.error

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


def chat_json(system: str, user: str, max_tokens: int = 700) -> dict:
    """Calls Groq's chat API and returns the model's reply parsed as JSON."""
    key = os.getenv("GROQ_API_KEY")
    model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    if not key:
        raise RuntimeError("GROQ_API_KEY is not set")

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.2,                       # low = consistent, less creative
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }
    req = urllib.request.Request(
        GROQ_URL,
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
            "User-Agent": "medichain/1.0",        # Groq's firewall can block the default Python agent
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            data = json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Groq error {e.code}: {e.read().decode()[:200]}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"Cannot reach Groq: {e.reason}")

    return json.loads(data["choices"][0]["message"]["content"])