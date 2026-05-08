"""
Backend Python d'Oralis — point d'entrée du pont IPC.
Lit des commandes JSON sur stdin, écrit les réponses JSON sur stdout.
"""
import sys
import json


def handle(cmd: dict) -> dict:
    method = cmd.get("method", "")
    params = cmd.get("params", {})
    req_id = cmd.get("id", None)

    if method == "ping":
        return {"id": req_id, "result": "pong"}

    return {"id": req_id, "error": f"Méthode inconnue : {method}"}


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            cmd = json.loads(line)
            response = handle(cmd)
        except json.JSONDecodeError as e:
            response = {"id": None, "error": f"JSON invalide : {e}"}
        except Exception as e:
            response = {"id": None, "error": str(e)}

        print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
