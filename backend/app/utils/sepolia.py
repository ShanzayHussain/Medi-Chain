import json
import os
import re
import urllib.request
import urllib.error
from decimal import Decimal

RPC_URL = os.getenv("SEPOLIA_RPC", "https://ethereum-sepolia-rpc.publicnode.com")
PHARMACY_WALLET = (os.getenv("PHARMACY_WALLET") or "").strip()
RATE = int(os.getenv("PKR_PER_ETH", "1000000"))      # demo rate: 1 test ETH = 1,000,000 PKR
HASH_RE = re.compile(r"^0x[0-9a-fA-F]{64}$")


def pkr_to_wei(pkr: int) -> int:
    return pkr * 10**18 // RATE


def wei_to_eth_str(wei: int) -> str:
    s = format(Decimal(wei).scaleb(-18), "f")
    return s.rstrip("0").rstrip(".") if "." in s else s


def rpc(method: str, params: list):
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    req = urllib.request.Request(
        RPC_URL, data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "medichain/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.load(r)
    except (urllib.error.URLError, TimeoutError) as e:
        raise RuntimeError(f"Cannot reach the Sepolia network: {e}")
    if "error" in data:
        raise RuntimeError(data["error"].get("message", "RPC error"))
    return data.get("result")


def check_payment(tx_hash: str, wallet: str, required_wei: int, created_ts: int):
    """Returns (state, message). state is 'ok', 'pending' or 'bad'."""
    tx = rpc("eth_getTransactionByHash", [tx_hash])
    if not tx:
        return "pending", "Transaction not found yet. If you just sent it, wait 20-30 seconds and verify again. Make sure it was sent on Sepolia."
    receipt = rpc("eth_getTransactionReceipt", [tx_hash])
    if not receipt or not receipt.get("blockNumber"):
        return "pending", "Transaction found but not confirmed yet. Wait a little and verify again."
    if receipt.get("status") != "0x1":
        return "bad", "The transaction failed on the network."
    if (tx.get("to") or "").lower() != wallet.lower():
        return "bad", "The payment was sent to a different address."
    sent = int(tx["value"], 16)
    if sent < required_wei:
        return "bad", f"Amount too low: sent {wei_to_eth_str(sent)} ETH, need {wei_to_eth_str(required_wei)} ETH."
    block = rpc("eth_getBlockByNumber", [receipt["blockNumber"], False])
    if int(block["timestamp"], 16) < created_ts - 120:
        return "bad", "This transaction was made before the order was created."
    return "ok", "Payment confirmed on Sepolia"
