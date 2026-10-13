"""Local, read-only MT5 demo connector for PaperLogix.

Run this on the same Windows computer as a logged-in MetaTrader 5 terminal:
    py -m pip install MetaTrader5
    py mt5_connector.py

It listens only on 127.0.0.1:8766. It never receives or stores MT5 passwords,
and it only reads the account and historical deal information exposed by MT5.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

try:
    import MetaTrader5 as mt5
except ImportError:  # Report this clearly through /health instead of crashing.
    mt5 = None


HOST = "127.0.0.1"
PORT = 8766


def json_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def mt5_error() -> str:
    if mt5 is None:
        return "MetaTrader5 Python package is not installed. Run: py -m pip install MetaTrader5"
    error = mt5.last_error()
    return f"MT5 is unavailable: {error[0]} - {error[1]}"


def health() -> tuple[int, dict[str, Any]]:
    if mt5 is None:
        return 503, {"ok": False, "error": mt5_error()}
    if not mt5.initialize():
        return 503, {"ok": False, "error": mt5_error()}
    info = mt5.account_info()
    if info is None:
        return 503, {"ok": False, "error": "MT5 terminal is open but no account is available."}
    # Trade mode values differ by terminal/broker. The client labels imported accounts DEMO
    # only after the user confirms the terminal is a demo account.
    return 200, {
        "ok": True,
        "terminal": "available",
        "loginSuffix": str(info.login)[-4:],
        "server": info.server,
    }


def sync() -> tuple[int, dict[str, Any]]:
    status, body = health()
    if status != 200:
        return status, body

    info = mt5.account_info()
    assert info is not None
    date_to = datetime.now(timezone.utc)
    date_from = date_to - timedelta(days=90)
    deals = mt5.history_deals_get(date_from, date_to)
    if deals is None:
        return 503, {"ok": False, "error": mt5_error()}

    type_map = {mt5.DEAL_TYPE_BUY: "BUY", mt5.DEAL_TYPE_SELL: "SELL"}
    exit_map = {mt5.DEAL_ENTRY_OUT, mt5.DEAL_ENTRY_OUT_BY}
    imported: list[dict[str, Any]] = []
    for deal in deals:
        # Keep only completed buy/sell exit deals. These form a safe, simple closed-trade ledger.
        if deal.type not in type_map or deal.entry not in exit_map:
            continue
        imported.append(
            {
                "id": f"MT5-{deal.ticket}",
                "symbol": deal.symbol,
                "date": datetime.fromtimestamp(deal.time, tz=timezone.utc).astimezone().strftime("%d %b, %H:%M"),
                "side": type_map[deal.type],
                "volume": f"{deal.volume:.2f} lots",
                "pnl": round(deal.profit + deal.swap + deal.commission + deal.fee, 2),
                "setup": "Unclassified",
                "status": "flag",
                "brokerDealId": str(deal.ticket),
                "positionId": str(deal.position_id),
            }
        )
    imported.sort(key=lambda deal: deal["id"], reverse=True)
    account_id = f"mt5-{info.login}"
    return 200, {
        "ok": True,
        "syncedAt": datetime.now().isoformat(timespec="seconds"),
        "account": {
            "id": account_id,
            "name": f"{info.server} · ••••{str(info.login)[-4:]}",
            "server": info.server,
            "balance": round(info.balance, 2),
            "currency": info.currency,
            "lastSync": "just now",
            "demoConfirmed": False,
        },
        "trades": imported,
        "coverage": {"periodDays": 90, "closedDeals": len(imported)},
    }


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        encoded = json.dumps(payload, default=json_value).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "null")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_json(204, {})

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            status, body = health()
            self.send_json(status, body)
            return
        self.send_json(404, {"ok": False, "error": "Not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path == "/sync":
            status, body = sync()
            self.send_json(status, body)
            return
        self.send_json(404, {"ok": False, "error": "Not found"})

    def log_message(self, *_: Any) -> None:
        return


if __name__ == "__main__":
    print(f"PaperLogix MT5 connector listening at http://{HOST}:{PORT}")
    print("Keep the MT5 terminal open and signed in to a DEMO account, then click Connect in PaperLogix.")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
